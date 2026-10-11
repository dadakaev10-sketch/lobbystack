import assert from "node:assert/strict";
import { createEmbeddingProvider } from "../packages/providers/src/ai/embeddingProvider";

// Only explicit isolated-probe settings; never fall back to production/OpenAI.
assert.ok(process.env.EMBEDDING_PROBE_BASE_URL?.startsWith("http://"));
assert.ok(process.env.EMBEDDING_BEARER_SECRET);
const provider = createEmbeddingProvider({
  AI_EMBEDDING_API_KEY: process.env.EMBEDDING_BEARER_SECRET,
  AI_EMBEDDING_BASE_URL: process.env.EMBEDDING_PROBE_BASE_URL,
  AI_EMBEDDING_MODEL: "gte-local",
  AI_EMBEDDING_PROVIDER_NAME: "local-gte",
  AI_EMBEDDING_REVISION: "a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644-bf16-lasttoken-noncausal-512-torch2.14.1-transformers5.19.0-v2",
  AI_EMBEDDING_MAX_PARALLEL_CALLS: "1",
  AI_EMBEDDING_MAX_BATCH_SIZE: "1",
  AI_EMBEDDING_TIMEOUT_MS: "30000",
});
assert.ok(provider);
const vectors = await provider.embed(["Wie kann ich manuelle Datenübertragung vermeiden?", "We connect your tools with n8n, Make or Power Automate to create seamless workflows and eliminate manual data entry."]);
assert.equal(vectors.length, 2);
for (const vector of vectors) {
  assert.equal(vector.length, 1536);
  assert.ok(vector.every(Number.isFinite));
  assert.ok(Math.abs(vector.reduce((sum, x) => sum + x*x, 0)-1) < 1e-5);
}
console.log(JSON.stringify({ dimensions: vectors[0]!.length, vectors: vectors.length, fingerprint: provider.fingerprint, cosine: vectors[0]!.reduce((sum,x,i)=>sum+x*vectors[1]![i]!,0) }));
