import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { businesses, knowledgeChunks, knowledgeDocuments, createDatabaseClient, withBusinessTransaction } from '@lobbystack/db';
import { OpenAiCompatibleEmbeddingProvider } from '@lobbystack/providers';
import { chunkText, searchKnowledgeEvidence } from '@lobbystack/domain';
import { handleJob } from './handlers';
import type { JobEnvelope } from '@lobbystack/contracts';

const url = process.env.LOBBY_EMBEDDING_E2E_DATABASE_URL;
if (url && (new URL(url).pathname !== '/lobby_embedding_test' || process.env.LOBBYSTACK_SKIP_ENV_FILES !== 'true')) throw new Error('Dedicated disposable embedding test DB required');
const owner = url ? createDatabaseClient('lobbystack_migrator', { DATABASE_URL: url }) : undefined;
const workerUrl = url ? new URL(url) : undefined;
if (workerUrl) workerUrl.username = 'lobbystack_worker';
const worker = workerUrl ? createDatabaseClient('lobbystack_worker', { DATABASE_URL: workerUrl.toString() }) : undefined;
const ids: string[] = [];
afterAll(async () => { if (owner) { for (const id of ids) await owner.db.delete(businesses).where(eq(businesses.id, id)); } await worker?.pool.end(); await owner?.pool.end(); });
const provider = url ? new OpenAiCompatibleEmbeddingProvider({ baseURL: process.env.LOBBY_EMBEDDING_E2E_BASE_URL!, apiKey: process.env.LOBBY_EMBEDDING_E2E_KEY!, model: 'gte-local', name: 'local-gte', revision: 'a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644-bf16-lasttoken-noncausal-512-torch2.14.1-transformers5.19.0-v2', maxBatchSize: 1, maxParallelCalls: 1, timeoutMs: 30000 }) : undefined;
async function business() { const id = randomUUID(); ids.push(id); await owner!.db.insert(businesses).values({ id, name: 'Embedding disposable fixture', slug: id, timezone: 'UTC', businessType: 'other' }); return id; }
function job(type: JobEnvelope['type'], businessId: string, payload: Record<string, unknown>): JobEnvelope { return { jobId: randomUUID(), type, businessId, payload, trace: {}, queue: 'bulk', idempotencyKey: randomUUID(), scheduled: false }; }
const domain = { db: worker?.db!, embeddings: provider! };

describe.skipIf(!url)('real isolated gte worker + pgvector + domain', () => {
  it('ingests token-heavy Unicode without truncation and retrieves a paraphrase under worker RLS', async () => {
    const id = await business();
    // Keep the Unicode length stress section separate from the semantic service passage.
    const text = '## Automation\nWir automatisieren wiederkehrende Büroabläufe mit KI und verbinden Software-Systeme.\n## Unicode stress\n' + '中文测试🙂'.repeat(180);
    const result = await handleJob(job('knowledge.crawlWebsite', id, { url: 'https://example.invalid/automation' }), { domain, embeddings: provider!, crawler: { crawl: async () => [{ url: 'https://example.invalid/automation', title: 'Service', markdown: text }] } });
    expect(result.status).toBe('completed');
    const rows = await owner!.db.select().from(knowledgeChunks).where(eq(knowledgeChunks.businessId, id)).orderBy(knowledgeChunks.sequence);
    expect(rows.length).toBeGreaterThan(chunkText(text).length);
    expect(rows.map(r => r.content).join('')).toBe(chunkText(text).join(''));
    for (const row of rows) { expect(row.embedding).toHaveLength(1536); expect(row.embeddingStatus).toBe('completed'); expect(row.embeddingFingerprint).toBe(provider!.fingerprint); }
    for (const page of [
      { url: 'https://example.invalid/bakery', title: 'Bäckerei', markdown: 'Unsere Bäckerei stellt frische Brötchen und traditionelle Sauerteigbrote her. Kuchen gibt es auf Bestellung.' },
      { url: 'https://example.invalid/garden', title: 'Gartenbau', markdown: 'Wir pflegen Gärten, schneiden Hecken und pflanzen Blumen. Rasenmähen und Baumpflege gehören zu unserem Angebot.' },
    ]) await handleJob(job('knowledge.crawlWebsite', id, { url: page.url }), { domain, embeddings: provider!, crawler: { crawl: async () => [page] } });
    const found = await searchKnowledgeEvidence(domain, { businessId: id, query: 'Wie kann ich repetitive Verwaltungsaufgaben durch künstliche Intelligenz reduzieren?' });
    expect(found.mode).toBe('hybrid'); expect(found.outcome).toBe('found'); expect(found.matches[0]?.sourceUrl).toBe('https://example.invalid/automation');
    const other = await business();
    const hidden = await withBusinessTransaction(worker!.db, { businessId: other, actorType: 'worker' }, tx => tx.select().from(knowledgeChunks).where(eq(knowledgeChunks.businessId, id)));
    expect(hidden).toEqual([]);
    const tokenCounts: number[] = [];
    for (const row of rows) {
      const response = await fetch(`${process.env.LOBBY_EMBEDDING_E2E_BASE_URL}/chunks`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LOBBY_EMBEDDING_E2E_KEY}` }, body: JSON.stringify({ model: 'gte-local', input: row.content }) });
      const measured = await response.json() as { token_counts: number[][] };
      expect(measured.token_counts[0]).toHaveLength(1);
      tokenCounts.push(measured.token_counts[0]![0]!);
    }
    expect(Math.max(...tokenCounts)).toBeLessThanOrEqual(512);
    await owner!.db.update(knowledgeChunks).set({ embeddingFingerprint: 'unrelated-model' }).where(eq(knowledgeChunks.businessId, id));
    const excluded = await searchKnowledgeEvidence(domain, { businessId: id, query: 'repetitive Verwaltungsaufgaben künstliche Intelligenz' });
    expect(excluded.matches).toEqual([]);
    await owner!.db.update(knowledgeChunks).set({ embeddingFingerprint: provider!.fingerprint }).where(eq(knowledgeChunks.businessId, id));
    await owner!.db.update(knowledgeDocuments).set({ active: false }).where(eq(knowledgeDocuments.businessId, id));
    expect((await searchKnowledgeEvidence(domain, { businessId: id, query: 'repetitive Verwaltungsaufgaben künstliche Intelligenz' })).matches).toEqual([]);
    console.log(JSON.stringify({ evidence: 'ingest-semantic-rls', fingerprintExcluded: true, inactiveExcluded: true, tokenCounts, chunks: rows.length, dimensions: rows[0]?.embedding?.length, mode: found.mode, source: found.matches[0]?.sourceUrl, searchMs: found.durationMs, crossTenantRows: hidden.length }));
  }, 180000);
  it('preserves old evidence on provider failure and rejects a concurrent revision change', async () => {
    const id = await business(); const doc = randomUUID();
    await owner!.db.insert(knowledgeDocuments).values({ id: doc, businessId: id, title: 'Race', sourceType: 'website', status: 'indexed', revision: 3 });
    const [old] = await owner!.db.insert(knowledgeChunks).values({ businessId: id, documentId: doc, sequence: 0, content: 'Automatische Büroarbeit.', contentHash: 'old', embeddingFingerprint: 'old', embeddingStatus: 'pending' }).returning();
    const failed = { fingerprint: provider!.fingerprint, prepareChunks: provider!.prepareChunks.bind(provider), embed: async () => { throw new Error('controlled failure'); } };
    await expect(handleJob(job('knowledge.reembedBusiness', id, {}), { domain, embeddings: failed })).rejects.toThrow('controlled failure');
    let rows = await owner!.db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc));
    expect(rows[0]?.id).toBe(old!.id); expect(rows[0]?.embeddingFingerprint).toBe('old');
    const raced = { fingerprint: provider!.fingerprint, prepareChunks: provider!.prepareChunks.bind(provider), embed: async (values: string[]) => { const vectors = await provider!.embed(values); await owner!.db.update(knowledgeDocuments).set({ revision: 4, status: 'cancelled' }).where(eq(knowledgeDocuments.id, doc)); return vectors; } };
    await expect(handleJob(job('knowledge.reembedBusiness', id, {}), { domain, embeddings: raced })).rejects.toThrow('Knowledge changed');
    rows = await owner!.db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc));
    expect(rows[0]?.id).toBe(old!.id); expect(rows[0]?.embeddingFingerprint).toBe('old');
    expect((await handleJob(job('knowledge.reembedBusiness', id, {}), { domain, embeddings: provider! })).status).toBe('skipped');
    console.log(JSON.stringify({ evidence: 'failure-concurrency', oldEvidencePreserved: true, staleCommitRejected: true, cancelledSkipped: true }));
  }, 180000);
  it('losslessly rechunks legacy oversized evidence and makes reruns idempotent', async () => {
    const id = await business(); const doc = randomUUID(); const text = '中文测试🙂'.repeat(180);
    await owner!.db.insert(knowledgeDocuments).values({ id: doc, businessId: id, title: 'Legacy', sourceType: 'website', sourceUrl: 'https://example.invalid/legacy', status: 'indexed', revision: 7 });
    await owner!.db.insert(knowledgeChunks).values({ businessId: id, documentId: doc, sequence: 0, content: text, contentHash: 'legacy', embeddingFingerprint: 'old', embeddingStatus: 'pending' });
    await handleJob(job('knowledge.reembedBusiness', id, {}), { domain, embeddings: provider! });
    const rows = await owner!.db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc)).orderBy(knowledgeChunks.sequence);
    expect(rows.length).toBeGreaterThan(1); expect(rows.map(r => r.content).join('')).toBe(text);
    expect(rows.every(r => r.embedding?.length === 1536 && r.embeddingFingerprint === provider!.fingerprint && r.embeddingStatus === 'completed')).toBe(true);
    const second = await handleJob(job('knowledge.reembedBusiness', id, {}), { domain, embeddings: provider! });
    expect(second.status).toBe('skipped');
    const again = await owner!.db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc)).orderBy(knowledgeChunks.sequence);
    expect(again.map(r => r.id)).toEqual(rows.map(r => r.id));
    console.log(JSON.stringify({ evidence: 'legacy-reindex', chunks: rows.length, lossless: true, dimensions: rows[0]?.embedding?.length, rerun: second.status }));
  }, 180000);
});
