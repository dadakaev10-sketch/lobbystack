# Private central website crawler

The self-hosted deployment uses Firecrawl v2.11.0 behind a private authenticated gateway. Only the worker joins `lobby-firecrawl-integration`; no public endpoint or customer API key is necessary.

`FIRECRAWL_BASE_URL=http://lobby-firecrawl-private:8080`, `FIRECRAWL_API_KEY` is a centrally managed runtime-only gateway credential, not a Firecrawl cloud subscription key. Compose now uses runtime interpolation instead of empty assignments. No onboarding, accounts or AI credentials are changed.

Onboarding imports remain capped at 10 pages per request, full/retry imports at 50 in LobbyStack and clamped to 25 by the conservative private gateway, max depth 2, 30-second scrape timeout, single concurrent job/browser. Existing business authorization and document deduplication remain authoritative. These are per-import quotas, not daily per-user quotas. The current product has no daily crawl allowance; deployment should monitor aggregate demand before wider rollout.

Firecrawl upstream source/AGPL attribution: https://github.com/dadakaev10-sketch/firecrawl/tree/private-lobbystack (deployment notes in deploy/PRIVATE_LOBBYSTACK.md). Preserve attribution and provide corresponding source where required.

Crawling readiness does not mean semantic indexing works: embeddings, business summaries and receptionist AI remain independently unconfigured. Do not enable paid AI to test this integration.

Verification: `node --test scripts/private-firecrawl-compose.test.mjs`, gateway unit tests, negative private target/auth tests, actual asynchronous `/v1/crawl` from the live worker against dadakaev.com, and HTTPS/auth smoke. User account/onboarding must not be changed just to manufacture an integration test.
