# Local embedding release gates — closed locally

Base: `59fff2d`, branch `feature/local-embeddings-verified`. No push, deployment, live environment change or production DB write was performed. External release remains the parent's responsibility.

## Verdict

**The two delegated local blockers are closed: exact-model-token ingestion/reindex compatibility and actual worker/domain/pgvector E2E. Ready for a parent-controlled canary release, not an assertion of general production readiness or live activation.** Keep `AI_EMBEDDING_STARTUP_BUSINESS_IDS=` empty by default. The earlier handoff's outstanding chunking/isolated-DB gate is superseded by this report; its backup, supply-chain, live readback and controlled migration gates remain.

## Contract and compatibility

- The private service now exposes authenticated, body/read-time-bounded `POST /v1/chunks`. It uses the very same pinned Qwen tokenizer as inference, with no truncation. Each accepted Unicode slice is independently counted against 512 tokens; splitting halves candidates until safe without assuming BPE token-count monotonicity. Concatenating pieces recovers the complete input, including Unicode. Existing Markdown section separation and character overlap remain upstream of this split.
- Upstream character/overlap boundaries now preserve UTF-16 surrogate pairs, preventing long emoji content from reaching the tokenizer as malformed Unicode. The dedicated regression failed before this fix and passed afterward (`lobby-chunk-unicode-red.log`).
- `OpenAiCompatibleEmbeddingProvider.prepareChunks()` calls this endpoint only for `gte-local`, requires the pinned revision, checks the returned model token ceiling, and rejects changed revision, malformed/lossy output or failed requests. Other embedding models keep existing chunking. Worker document extraction and website indexing pass the exact prepared chunks into the domain writer, which independently checks complete content preservation and stores one vector per prepared chunk.
- Existing indexed documents are reembedded document-by-document. Each original stored chunk is split independently, so existing overlap is preserved, not accidentally duplicated through joining/re-normalization. All real vectors are computed before any replacement. The commit locks the document/chunks and compares document revision/status plus chunk IDs/content/fingerprint/status to the original snapshot. A concurrent edit/cancel/reindex rejects the stale commit. Failed inference leaves original evidence intact and retryable. Successful replacement updates contiguous sequence, hashes, completed fingerprint, document revision and snapshot-refresh outbox. Cancelled/processing/error documents are not resurrected by this path. Reruns with the current fingerprint are skipped.
- The model revision/output geometry/fingerprint contract is unchanged: native 1536-dimensional BF16, pinned noncausal implementation, last-token pooling and L2 normalization. Oversized direct embedding calls still receive 413; no padding or silent truncation.
- Both Compose definitions now name the tested **`lobbystack-local-embeddings:gte-a9af15a-chunked`** image. Do not activate an old cached image lacking `/v1/chunks`. Build using the secret-free build Compose, then require a new runtime bearer secret and verify readiness/tokenization before changing admin/worker runtime settings. The tested local image ID is recorded in `local-embeddings-e2e.json`.

## Real isolated evidence

Reproduce from this checkout after installing workspace dependencies/build prerequisites:

```sh
python3 scripts/local-embedding-e2e.py
```

The runner builds the service, creates a unique disposable Docker network, starts the cached actual model under a 6GiB/no-swap/2-CPU limit and a separate disposable pgvector PostgreSQL instance without host ports, applies actual project migrations, enables the isolated worker role, then runs the real job handler/domain pipeline. Env-file loading is disabled and inherited DB/provider variables are removed. The source crawler is a synthetic fixture adapter, not a live crawl. The DB writer/retriever and model/provider are real; no dummy vectors. This exercises the worker handler, not a separately running BullMQ daemon or generated receptionist answers.

Final evidence: `docs/deployment/local-embeddings-e2e.json`, raw `/root/.hermes/cache/scratch/lobby-chunk-e2e.log`.

- **3 actual DB/model E2E tests passed.** Token-heavy multilingual/emoji document became 3 source-preserving chunks with exact counts **26, 269, 276**. All stored vectors were native 1536 and completed with the actual provider fingerprint.
- Paraphrased German automation query ranked the correct source first against real embedded bakery/gardening distractors; domain mode `hybrid`, 380.48ms in the final run. Worker-role cross-business read returned 0 rows. Wrong fingerprints and inactive documents were excluded.
- Legacy oversized evidence first reproduced the genuine service **413** on the pre-fix reembedding path (`lobby-chunk-e2e-red.log`). Fixed path losslessly replaced it with 2 real-vector chunks; repeat job skipped with identical chunk IDs.
- Controlled provider failure retained old evidence. A real inference followed by a concurrent document revision/cancellation made the replacement fail rather than overwrite it. Subsequent cancelled-document job skipped.
- **13 service/algorithm/HTTP tests passed**, including unauthenticated tokenizer rejection, raw oversized Unicode 413, exact chunk reconstruction, and each split chunk's reported count matching actual embedding usage.
- Final model memory peak **6442450944 bytes**, `oom=0`, `oom_kill=0`, swap 0; `memory.events.max=1669` records reclaim at the hard limit, not spare capacity. No host ports. The runner read back and verified deletion of disposable containers/network; model cache/image retained. This is not a capacity/load guarantee.

A deliberately mixed semantic passage drowned in hundreds of unrelated Unicode repeats failed the distractor ranking check. The final fixture separates stress content into a Markdown section, matching existing section-aware ingestion. Do not infer broad retrieval quality from this small corpus; real customer-quality/load evaluation remains necessary.

## Final workspace verification

- Sequential workspace plus scripts: **2711 passed, 184 skipped** (includes 3 explicit-opt-in model E2E tests skipped in the ordinary run; those 3 passed separately against the disposable DB).
- Build-configuration tests: **2 passed**.
- Full sequential workspace typechecks and scripts typecheck: exit 0.
- Full sequential workspace build, worker runtime bundle, admin prerender check (32 localized public routes) and embed copy: exit 0.
- `git diff --check`: clean.
- Logs: `/root/.hermes/cache/scratch/lobby-chunk-final-{tests,typecheck,build}.log`.
- The first combined long tool call reached its runtime timeout and interrupted the worker build with SIGTERM. The complete build was rerun as a tracked background job and awaited to verified exit 0; final build log is the successful rerun.

## Parent external-release gates (unchanged)

Review/commit tree, establish backup/restore and rollback, inspect already queued jobs, deploy the protective code with an empty startup list, start the new private model image, and then verify exact runtime settings on both admin and worker. Only explicitly authorized business IDs may trigger a controlled backfill. Clear one-shot IDs afterward. Changing provider fingerprints excludes old semantic vectors until controlled reembedding; lexical fallback remains. Verify live indexing/retrieval on an approved fixture and health after activation. Existing supply-chain/CVE and broad quality/load checks are not claimed complete here.
