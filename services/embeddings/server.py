"""Private CPU embeddings; vendored, pinned upstream model implementation."""
import asyncio
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from contract import authorized, validate_payload, MODEL_ALIAS, MAX_BODY, MAX_TOKENS

MODEL_ID = 'Alibaba-NLP/gte-Qwen2-1.5B-instruct'
REVISION = 'a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644'
secret = os.environ.get('EMBEDDING_BEARER_SECRET', '')
if len(secret) < 32:
    raise RuntimeError('A runtime bearer secret of at least 32 characters is required')
model = tokenizer = None
busy = False


def load():
    global model, tokenizer
    import torch
    from transformers import Qwen2Config, AutoTokenizer
    from huggingface_hub import snapshot_download
    from modeling_qwen import Qwen2Model
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    snapshot = snapshot_download(MODEL_ID, revision=REVISION, max_workers=1,
        allow_patterns=['*.safetensors', '*.json', 'merges.txt', 'vocab.json'])
    config = Qwen2Config.from_pretrained(snapshot, local_files_only=True)
    if config.hidden_size != 1536 or config.is_causal:
        raise RuntimeError('Model contract mismatch')
    # Rotary cache only, not a weight/embedding projection. Requests cannot exceed this.
    config.max_position_embeddings = MAX_TOKENS
    config.use_cache = False
    tokenizer = AutoTokenizer.from_pretrained(snapshot, trust_remote_code=False, local_files_only=True)
    model = Qwen2Model.from_pretrained(snapshot, config=config, torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True, use_safetensors=True, local_files_only=True,
        attn_implementation='sdpa').eval()


def infer(values):
    import torch
    vectors = []
    tokens = 0
    batches = [tokenizer(x, return_tensors='pt', truncation=False) for x in values]
    if any(b['input_ids'].shape[1] > MAX_TOKENS for b in batches):
        raise OverflowError('Token limit exceeded')
    with torch.inference_mode():
        for batch in batches:
            tokens += batch['input_ids'].shape[1]
            hidden = model(**batch, use_cache=False, is_causal=False).last_hidden_state
            v = torch.nn.functional.normalize(hidden[:, -1, :].float(), p=2, dim=1)[0]
            if v.shape[0] != 1536 or not torch.isfinite(v).all() or v.norm() == 0:
                raise RuntimeError('Invalid model output')
            vectors.append(v.tolist())
    return {'object':'list', 'model':MODEL_ALIAS,
        'data':[{'object':'embedding','index':i,'embedding':v} for i,v in enumerate(vectors)],
        'usage':{'prompt_tokens':tokens,'total_tokens':tokens}}


@asynccontextmanager
async def lifespan(app):
    await asyncio.to_thread(load)
    yield

app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

@app.get('/health/live')
async def live():
    return {'status':'live'}

@app.get('/health/ready')
async def ready():
    return JSONResponse({'status':'ready' if model is not None else 'loading','model':MODEL_ID,
        'revision':REVISION,'dimensions':1536},status_code=200 if model is not None else 503)

@app.post('/v1/chunks')
async def chunks(request: Request):
    # Tokenization only: no inference lock, no truncation, no input logging.
    from chunking import split_for_tokenizer
    if not authorized(request.headers.get('authorization'), secret):
        return JSONResponse({'error':'Unauthorized'}, status_code=401)
    body = bytearray()
    try:
        async with asyncio.timeout(5):
            async for part in request.stream():
                body.extend(part)
                if len(body) > MAX_BODY:
                    return JSONResponse({'error':'Body limit exceeded'}, status_code=413)
        values = validate_payload(json.loads(body))
        prepared = [split_for_tokenizer(value, lambda x: tokenizer.encode(x, truncation=False), MAX_TOKENS) for value in values]
        return {'chunks': prepared, 'revision': REVISION, 'max_tokens': MAX_TOKENS,
            'token_counts': [[len(tokenizer.encode(chunk, truncation=False)) for chunk in group] for group in prepared]}
    except TimeoutError:
        return JSONResponse({'error':'Body timeout'}, status_code=408)
    except (ValueError, TypeError, UnicodeDecodeError):
        return JSONResponse({'error':'Invalid request'}, status_code=400)

@app.post('/v1/embeddings')
async def embeddings(request: Request):
    global busy
    if not authorized(request.headers.get('authorization'), secret):
        return JSONResponse({'error':'Unauthorized'},status_code=401)
    if busy:
        return JSONResponse({'error':'Busy'},status_code=429,headers={'Retry-After':'1'})
    busy = True
    try:
        body = bytearray()
        try:
            async with asyncio.timeout(5):
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > MAX_BODY:
                        return JSONResponse({'error':'Body limit exceeded'},status_code=413)
        except TimeoutError:
            return JSONResponse({'error':'Body timeout'},status_code=408)
        try:
            values = validate_payload(json.loads(body))
        except (ValueError, TypeError, UnicodeDecodeError):
            return JSONResponse({'error':'Invalid request'},status_code=400)
        try:
            return await asyncio.to_thread(infer, values)
        except OverflowError:
            return JSONResponse({'error':'Token limit exceeded'},status_code=413)
        except Exception:
            return JSONResponse({'error':'Inference failed'},status_code=503)
    finally:
        busy = False
