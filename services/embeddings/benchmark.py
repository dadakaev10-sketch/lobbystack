"""Bounded worst-input latency benchmark using repeated public-source text."""
import json
import os
import time
import urllib.request
from pathlib import Path
from transformers import AutoTokenizer
path='/cache/hub/models--Alibaba-NLP--gte-Qwen2-1.5B-instruct/snapshots/a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644'
tokenizer=AutoTokenizer.from_pretrained(path,trust_remote_code=False,local_files_only=True)
text=json.loads(Path('/app/retrieval-fixture.json').read_text())['passages'][0]['text']
ids=tokenizer.encode((text+'\n')*30,add_special_tokens=False)[:512]
inputs=[('1800-character-chunk',((text+'\n')*20)[:1800]),('512-token-input',tokenizer.decode(ids))]
results=[]
for name,value in inputs:
    req=urllib.request.Request('http://127.0.0.1:8080/v1/embeddings',data=json.dumps({'model':'gte-local','input':value}).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['EMBEDDING_BEARER_SECRET']})
    start=time.monotonic()
    with urllib.request.urlopen(req,timeout=120) as r: data=json.load(r)
    results.append({'case':name,'characters':len(value),'tokens':data['usage']['total_tokens'],'latencyMs':round((time.monotonic()-start)*1000,2),'dimensions':len(data['data'][0]['embedding'])})
stat={k:int(v) for k,v in (line.split() for line in Path('/sys/fs/cgroup/memory.stat').read_text().splitlines())}
print(json.dumps({'results':results,'anonymousMemoryBytes':stat['anon'],'fileCacheBytes':stat['file'],'memoryPeakBytes':int(Path('/sys/fs/cgroup/memory.peak').read_text()),'memoryEvents':Path('/sys/fs/cgroup/memory.events').read_text(),'swapBytes':int(Path('/sys/fs/cgroup/memory.swap.current').read_text())},indent=2))
