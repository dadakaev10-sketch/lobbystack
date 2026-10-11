import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin and worker expose runtime embedding settings without build secrets', () => {
  const source=readFileSync(new URL('../../docker-compose.coolify.yml',import.meta.url),'utf8');
  for (const service of ['admin','worker']) {
    // Use full service span, nested indentation does not terminate the block.
    const span=source.slice(source.indexOf(`  ${service}:\n`), service==='admin'?source.indexOf('  worker:\n'):source.indexOf('\nvolumes:\n'));
    assert.ok(span.includes('AI_EMBEDDING_API_KEY: ${AI_EMBEDDING_API_KEY:-}'));
    assert.ok(span.includes('AI_EMBEDDING_MODEL: ${AI_EMBEDDING_MODEL:-text-embedding-3-small}'));
    assert.ok(span.includes('AI_EMBEDDING_MAX_PARALLEL_CALLS: ${AI_EMBEDDING_MAX_PARALLEL_CALLS:-4}'));
    assert.ok(span.includes('AI_EMBEDDING_TIMEOUT_MS: ${AI_EMBEDDING_TIMEOUT_MS:-30000}'));
    assert.ok(!span.slice(0,span.indexOf('    environment:')).includes('AI_EMBEDDING_API_KEY'));
  }
});
