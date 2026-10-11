#!/usr/bin/env python3
"""Disposable native-model E2E. No env files, host ports or production networks/DBs.
Run from repository root: python3 scripts/local-embedding-e2e.py
Requires cached model volume and Docker. Always removes disposable containers/network.
"""
import json
import os
import secrets
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG = Path(os.environ.get('TMPDIR', '/root/.hermes/cache/scratch')) / 'lobby-chunk-e2e.log'
PREFIX = 'lobby-embedding-e2e-' + secrets.token_hex(4)
MODEL = PREFIX + '-model'
DB = PREFIX + '-db'
IMAGE = 'lobbystack-local-embeddings:gte-a9af15a-chunked'
CACHE = 'lobby-embedding-probe_embedding_cache'

def run(args, **kwargs):
    return subprocess.run(args, check=True, cwd=ROOT, **kwargs)
def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()
def address(name):
    return json.loads(docker('inspect', name))[0]['NetworkSettings']['Networks'][PREFIX]['IPAddress']

def main():
    secret = secrets.token_hex(32)
    env = {k: v for k, v in os.environ.items() if not ('DATABASE_URL' in k or k.startswith(('AI_', 'OPENAI_', 'LOBBYSTACK_')))}
    env['LOBBYSTACK_SKIP_ENV_FILES'] = 'true'
    with LOG.open('w') as log:
        try:
            run(['docker', 'build', '-t', IMAGE, 'services/embeddings'], stdout=log, stderr=log)
            run(['docker', 'network', 'create', PREFIX], stdout=log, stderr=log)
            run(['docker', 'run', '-d', '--name', MODEL, '--network', PREFIX, '--memory', '6g', '--memory-swap', '6g', '--cpus', '2', '--pids-limit', '128', '--read-only', '--tmpfs', '/tmp:size=64m', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '-e', 'EMBEDDING_BEARER_SECRET', '-v', CACHE + ':/cache', IMAGE], env={**env, 'EMBEDDING_BEARER_SECRET': secret}, stdout=subprocess.DEVNULL, stderr=log)
            run(['docker', 'run', '-d', '--name', DB, '--network', PREFIX, '--memory', '512m', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=lobby_embedding_test', 'pgvector/pgvector@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a'], stdout=subprocess.DEVNULL, stderr=log)
            dburl = 'postgres://postgres@' + address(DB) + ':5432/lobby_embedding_test'
            base = 'http://' + address(MODEL) + ':8080'
            deadline = time.monotonic() + 600
            while True:
                try:
                    with urllib.request.urlopen(base + '/health/ready', timeout=3) as r:
                        health = json.load(r)
                    if health['dimensions'] == 1536:
                        break
                except Exception:
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Model readiness deadline exceeded')
                    time.sleep(2)
            log.write('MODEL_HEALTH ' + json.dumps(health) + '\n'); log.flush()
            env['DATABASE_URL'] = dburl
            run(['pnpm', '--filter', '@lobbystack/db', 'db:migrate'], env=env, stdout=log, stderr=log)
            run(['docker', 'exec', DB, 'psql', '-U', 'postgres', '-d', 'lobby_embedding_test', '-c', 'ALTER ROLE lobbystack_worker LOGIN'], stdout=log, stderr=log)
            env.update(LOBBY_EMBEDDING_E2E_DATABASE_URL=dburl, LOBBY_EMBEDDING_E2E_BASE_URL=base + '/v1', LOBBY_EMBEDDING_E2E_KEY=secret, AI_EMBEDDING_SEARCH_TIMEOUT_MS='6000')
            run(['pnpm', '--filter', '@lobbystack/worker', 'exec', 'vitest', 'run', 'src/localEmbeddings.integration.test.ts', '--silent=false', '--reporter=verbose'], env=env, stdout=log, stderr=log)
            run(['docker', 'exec', MODEL, 'python', '-m', 'unittest', 'test_contract', 'test_chunking', 'test_http'], stdout=log, stderr=log)
            log.write('IMAGE_ID ' + docker('inspect', MODEL, '--format', '{{.Image}}') + '\n')
            # Inspect only secret-free resource fields and cgroup counters.
            for field in ['Memory', 'MemorySwap', 'PortBindings']:
                log.write(field + ' ' + docker('inspect', MODEL, '--format', '{{json .HostConfig.' + field + '}}') + '\n')
            run(['docker', 'exec', MODEL, 'python', '-c', "from pathlib import Path; print('CGROUP', {n:Path('/sys/fs/cgroup/'+n).read_text() for n in ['memory.peak','memory.events','memory.swap.current']})"], stdout=log, stderr=log)
            print('PASS: actual model, disposable pgvector, worker/domain; evidence ' + str(LOG))
        finally:
            for name in [MODEL, DB]:
                subprocess.run(['docker', 'rm', '-fv', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['docker', 'network', 'rm', PREFIX], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            remaining = docker('ps', '-a', '--filter', 'name=' + PREFIX, '--format', '{{.Names}}')
            if remaining:
                raise RuntimeError('Disposable container cleanup failed')
            if PREFIX in docker('network', 'ls', '--format', '{{.Name}}').splitlines():
                raise RuntimeError('Disposable network cleanup failed')
            log.write('CLEANUP verified: disposable model/DB/network removed; persistent model cache retained\n')

if __name__ == '__main__':
    main()
