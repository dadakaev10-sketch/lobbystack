import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const compose = readFileSync(new URL('../docker-compose.coolify.yml', import.meta.url), 'utf8');
test('central Firecrawl credentials are runtime interpolated, not empty or embedded', () => {
  assert.match(compose, /FIRECRAWL_API_KEY: \$\{FIRECRAWL_API_KEY:\?[^}]+\}/);
  assert.match(compose, /FIRECRAWL_BASE_URL: \$\{FIRECRAWL_BASE_URL:\?[^}]+\}/);
  assert.doesNotMatch(compose, /FIRECRAWL_(API_KEY|BASE_URL): ''/);
});
test('only the worker joins the dedicated Firecrawl integration network', () => {
  const services = compose.slice(0, compose.indexOf('\nvolumes:'));
  assert.equal((services.match(/firecrawl_integration: \{\}/g) ?? []).length, 1);
  assert.match(services.slice(services.indexOf('\n  worker:')), /firecrawl_integration: \{\}/);
  assert.match(compose, /firecrawl_integration:\n    external: true\n    name: lobby-firecrawl-integration/);
});
