import { createHash } from 'node:crypto';
import { and, asc, eq, isNull, ne, or } from 'drizzle-orm';
import { enqueueOutbox, knowledgeChunks, knowledgeDocuments, withBusinessTransaction, type Database } from '@lobbystack/db';

type Provider = { fingerprint?: string; prepareChunks?(values: string[]): Promise<string[]>; embed(values: string[]): Promise<number[][]> };

/** Rebuild each document atomically. Keep old evidence intact until all new vectors exist. */
export async function reembedPreparedDocuments(db: Database, businessId: string, provider: Provider): Promise<number> {
  const fingerprint = provider.fingerprint!;
  let count = 0;
  while (true) {
    const snapshot = await withBusinessTransaction(db, { businessId, actorType: 'worker' }, async tx => {
      const [candidate] = await tx.select({ documentId: knowledgeChunks.documentId }).from(knowledgeChunks)
        .innerJoin(knowledgeDocuments, eq(knowledgeDocuments.id, knowledgeChunks.documentId))
        .where(and(eq(knowledgeChunks.businessId, businessId), eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.status, 'indexed'),
          or(isNull(knowledgeChunks.embeddingFingerprint), ne(knowledgeChunks.embeddingFingerprint, fingerprint), isNull(knowledgeChunks.embedding), ne(knowledgeChunks.embeddingStatus, 'completed')))).limit(1);
      if (!candidate) return undefined;
      const [document] = await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, candidate.documentId), eq(knowledgeDocuments.businessId, businessId))).limit(1);
      const rows = await tx.select().from(knowledgeChunks).where(and(eq(knowledgeChunks.documentId, candidate.documentId), eq(knowledgeChunks.businessId, businessId))).orderBy(asc(knowledgeChunks.sequence));
      return document ? { document, rows } : undefined;
    });
    if (!snapshot) break;
    // Independently split existing chunks, preserving their original overlap and every byte.
    // Do not re-normalize/re-chunk a joined document: that would duplicate overlap.
    const originals = snapshot.rows.map(row => row.content);
    const chunks = await provider.prepareChunks!(originals);
    if (!chunks.length || chunks.some(chunk => !chunk.trim()) || chunks.join('') !== originals.join('')) throw new Error('Reembedding chunks must preserve source content.');
    const vectors = await provider.embed(chunks);
    if (vectors.length !== chunks.length || vectors.some(v => v.length !== 1536 || v.some(x => !Number.isFinite(x)) || v.every(x => x === 0))) throw new Error('Reembedding returned incompatible vectors.');
    await withBusinessTransaction(db, { businessId, actorType: 'worker' }, async tx => {
      const [current] = await tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, snapshot.document.id), eq(knowledgeDocuments.businessId, businessId))).limit(1).for('update');
      const rows = await tx.select().from(knowledgeChunks).where(and(eq(knowledgeChunks.documentId, snapshot.document.id), eq(knowledgeChunks.businessId, businessId))).orderBy(asc(knowledgeChunks.sequence)).for('update');
      if (!current || current.status !== 'indexed' || current.revision !== snapshot.document.revision || rows.length !== snapshot.rows.length || rows.some((row, i) => row.id !== snapshot.rows[i]!.id || row.content !== snapshot.rows[i]!.content || row.embeddingFingerprint !== snapshot.rows[i]!.embeddingFingerprint || row.embeddingStatus !== snapshot.rows[i]!.embeddingStatus)) throw new Error('Knowledge changed during reembedding; retry required.');
      await tx.delete(knowledgeChunks).where(and(eq(knowledgeChunks.documentId, current.id), eq(knowledgeChunks.businessId, businessId)));
      await tx.insert(knowledgeChunks).values(chunks.map((content, sequence) => ({ businessId, documentId: current.id, sequence, content, contentHash: createHash('sha256').update(content).digest('hex'), embedding: vectors[sequence]!, embeddingFingerprint: fingerprint, embeddingStatus: 'completed', embeddingError: null })));
      await tx.update(knowledgeDocuments).set({ revision: current.revision + 1, updatedAt: new Date() }).where(and(eq(knowledgeDocuments.id, current.id), eq(knowledgeDocuments.businessId, businessId)));
      await enqueueOutbox(tx, { topic: 'snapshot.refresh', businessId, aggregateType: 'knowledge_document', aggregateId: current.id, dedupeKey: `knowledge:${current.id}:reembed:${current.revision + 1}:${fingerprint}`, payload: { businessId, reason: 'document_reembedded' } });
    });
    count += chunks.length;
  }
  return count;
}
