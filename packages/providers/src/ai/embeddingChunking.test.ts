import { afterEach, expect, it, vi } from 'vitest';
import { OpenAiCompatibleEmbeddingProvider } from './embeddingProvider';
afterEach(() => vi.unstubAllGlobals());
it('uses the pinned local tokenizer and refuses loss or unexpected revision', async () => {
  const provider = new OpenAiCompatibleEmbeddingProvider({ model: 'gte-local', baseURL: 'http://private/v1', revision: 'a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644-bf16-lasttoken-noncausal-512-v1' });
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ chunks: [['abc', 'def']], revision: 'a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644', max_tokens: 512 })));
  vi.stubGlobal('fetch', fetcher);
  expect(await provider.prepareChunks(['abcdef'])).toEqual(['abc', 'def']);
  fetcher.mockResolvedValue(new Response(JSON.stringify({ chunks: [['abc']], revision: 'a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644', max_tokens: 512 })));
  await expect(provider.prepareChunks(['abcdef'])).rejects.toThrow('lossy');
  fetcher.mockResolvedValue(new Response('{}', { status: 503 }));
  await expect(provider.prepareChunks(['abcdef'])).rejects.toThrow('503');
  fetcher.mockResolvedValue(new Response(JSON.stringify({ chunks: [['abc']], revision: 'wrong', max_tokens: 512 })));
  await expect(provider.prepareChunks(['abcdef'])).rejects.toThrow();
});
it('does not change nonlocal provider chunking', async () => {
  const provider = new OpenAiCompatibleEmbeddingProvider({});
  expect(await provider.prepareChunks(['abcdef'])).toEqual(['abcdef']);
});
