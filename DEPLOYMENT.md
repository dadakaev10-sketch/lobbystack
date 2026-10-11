# Dadakaev self-hosted preview

Upstream: https://github.com/lobbystack/lobbystack
Baseline revision: `ddda7f01376d6cd48bd16fc4313a4aaa961dd1ee` (MIT; original LICENSE retained).

Coolify tracks this fork's `main` branch and `docker-compose.coolify.yml`.
Dashboard: https://lobby.apps.dadakaev.tech

## Isolation

Dedicated PostgreSQL/pgvector, PostgreSQL runtime roles, Redis AOF, upload storage,
and Compose network. Only the admin also joins the existing external `coolify`
proxy network. No host ports, no Docker socket, no shared Amina volumes or data.
The existing Caddy docker-proxy observes the admin's labels; it is not restarted.
Images for PostgreSQL, Redis, and Node base are digest-pinned. App images label the
upstream baseline; Coolify deployment history records the fork configuration SHA.

## Safe initial preview

Provider keys, SMTP, billing, analytics, and OTLP are explicitly empty.
Live prototype and new widget issuance are disabled. Certification mode is enabled
with empty allowlists, so external email/SMS/calendar destinations fail closed and
live phone purchase/release/reconfiguration and Polar billing are prohibited.
Email verification is disabled only for this unconfigured-mail preview; password
reset, invites, and delivery are unavailable. Do not process real customer data.

Model configuration deliberately replaces upstream's implicit `gpt-6-luna`:
`gpt-4.1-mini` for chat/summary/delegation and `text-embedding-3-small` for embeddings.
These are configuration choices, not a claim of tested provider integration. No AI
key is supplied and no inference request is made. Voice remains disabled pending
separately approved OpenAI/Twilio credentials and compatible live runtime review.

## Secrets and operations

All database passwords, auth/encryption keys, internal service tokens, widget and
storage signing secrets are runtime-only Coolify environment variables, never
Docker build arguments or committed files. Preserve them across redeployments.
Manage deploy/start/stop/logs and variables in Coolify. Do not manually start a
second Compose stack. Upgrade upstream only after reviewing changes and taking
coherent PostgreSQL plus upload-storage backups.

Off-host backups and a restore drill are required before production go-live.
