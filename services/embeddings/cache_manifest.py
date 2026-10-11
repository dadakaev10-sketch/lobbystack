"""Cache integrity evidence; runs inside quota-limited service container."""
import hashlib
import json
from pathlib import Path
root=Path('/cache/hub/models--Alibaba-NLP--gte-Qwen2-1.5B-instruct/snapshots/a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644')
files={}
for path in sorted(root.iterdir()):
    if path.is_file():
        h=hashlib.sha256()
        with path.open('rb') as f:
            for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
        files[path.name]={'bytes':path.stat().st_size,'sha256':h.hexdigest()}
print(json.dumps({'revision':root.name,'files':files,'vendoredCodeSha256':hashlib.sha256(Path('/app/modeling_qwen.py').read_bytes()).hexdigest(),'memoryPeakBytes':int(Path('/sys/fs/cgroup/memory.peak').read_text()),'memoryEvents':Path('/sys/fs/cgroup/memory.events').read_text(),'swapBytes':int(Path('/sys/fs/cgroup/memory.swap.current').read_text())},indent=2))
