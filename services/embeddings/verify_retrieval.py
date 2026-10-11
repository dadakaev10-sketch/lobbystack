"""Real HTTP semantic retrieval, source provenance and measurements, no DB."""
import hashlib
import json
import math
import os
import time
import urllib.request
from pathlib import Path

fixture_path = Path(os.environ.get('FIXTURE', '/app/retrieval-fixture.json'))
raw = fixture_path.read_bytes()
fixture = json.loads(raw)

def embed(text):
    body = json.dumps({'model':'gte-local','input':text}).encode()
    req=urllib.request.Request('http://127.0.0.1:8080/v1/embeddings',data=body,
        headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['EMBEDDING_BEARER_SECRET']})
    started=time.monotonic()
    with urllib.request.urlopen(req,timeout=120) as r: data=json.load(r)
    vector=data['data'][0]['embedding']
    assert len(vector)==1536 and all(math.isfinite(x) for x in vector)
    assert abs(sum(x*x for x in vector)-1)<1e-5
    return vector,round((time.monotonic()-started)*1000,2),data['usage']['total_tokens']

vectors=[]
measurements=[]
for p in fixture['passages']:
    v,ms,tokens=embed(p['text'])
    vectors.append(v)
    measurements.append({'id':p['id'],'latencyMs':ms,'tokens':tokens,'textSha256':hashlib.sha256(p['text'].encode()).hexdigest()})
query,ms,tokens=embed(fixture['query'])
scores=sorted([{'id':p['id'],'cosine':sum(x*y for x,y in zip(v,query)),'source':fixture['source'],'text':p['text']} for p,v in zip(fixture['passages'],vectors)],key=lambda x:-x['cosine'])
assert scores[0]['id']==fixture['expected'],scores
print(json.dumps({'fixtureSha256':hashlib.sha256(raw).hexdigest(),'query':fixture['query'],'queryLatencyMs':ms,'queryTokens':tokens,'dimensions':1536,'measurements':measurements,'ranking':scores,'vectorsSha256':hashlib.sha256(json.dumps(vectors).encode()).hexdigest()},ensure_ascii=False,indent=2))
