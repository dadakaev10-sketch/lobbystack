# Erneute lokale Abnahme / sichere Aktivierung

Branch `feature/local-embeddings-verified`, Ausgangspunkt `0aa308b`. Die spätere Nutzerfreigabe erlaubt Push/Live-Aktivierung durch den Parent; dieser Arbeitslauf hat nichts gepusht, deployed oder an Kunden/Live-ENV/DB verändert.

## Aktueller Gate-Abschluss

Die unten dokumentierten damaligen Chunking-/Staging-Blocker sind inzwischen lokal geschlossen; siehe [local-embeddings-release-gates.md](./local-embeddings-release-gates.md) und [reale E2E-Belege](./local-embeddings-e2e.json). Der neue Dienst benötigt das Image `gte-a9af15a-chunked` mit authentifiziertem `/v1/chunks`. Exakte Modelltokens, bestehende Chunk-Neuaufbereitung, echter Worker-Handler/Domain/pgvector, RLS und Fehler-/Revisionsschutz wurden isoliert geprüft. Standard-Startupliste bleibt leer. Kontrollierter Canary-Release durch den Parent ist lokal freigeprüft; Backup/CVE/Live-Readback und breitere Qualität/Last bleiben getrennte externe Gates. Der restliche Text ist die historische Abnahme vor diesem Abschluss.

## Reale erneute Abnahme

Isolierter Compose-Projektname `lobby-embedding-probe`, vorhandenes Image `lobbystack-local-embeddings:gte-a9af15a`, vorhandener persistenter Cache. Runtime-Bearer neu zufällig generiert, niemals gespeichert/ausgegeben. Probe zum Abschluss `exited`; PortBindings `{}`, RAM/MemorySwap jeweils 6442450944 Bytes.

Modell: https://huggingface.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct/tree/a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644 ; Revision `a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644`, Apache-2.0, native 1536 Dimensionen. Vendorte nichtkausale Implementierung, BF16, Last-token-Pooling, L2-Normalisierung; keine Dummy-/Padding-Vektoren. Vollständige Provenienz und Hashmanifest bleiben in `local-embeddings.md` / `local-embeddings-manifest.json`.

Neue Rohbelege:
- `local-embeddings-retrieval-rerun.json`: paraphrasierte deutsche Frage 24 Tokens/300.97ms; Automation Rang 1, Cosinus 0.34585404645704854; vier öffentliche dadakaev.com Passagen.
- `local-embeddings-sdk-rerun.json`: echter LobbyStack AI-SDK-Provider, zwei native 1536-Vektoren, Cosinus 0.4577497183530334. Fingerprint ist probe-URL-abhängig und NICHT der spätere Live-Fingerprint.
- `local-embeddings-benchmark-rerun.json`: 357 Tokens/1800 Zeichen 3270.50ms; 512 Tokens 4209.63ms. Peak 6442471424 Bytes, anonymer Speicher 3619467264 Bytes, Dateicache 2796666880 Bytes. memory.events.max=3963 (Cache-Reclaim), oom=0, oom_kill=0, Swap=0. Keine Kapazitätsgarantie.

9 reale Diensttests bestanden. Erneuter vollständiger Workspace-/Scripts-Test: 2708 bestanden, 181 DB-/Integrationstests übersprungen; zusätzlich 2 Build-Konfigurationstests bestanden. Vollständige sequenzielle Typechecks, Scripts-Typecheck, Workspace-Build, Admin-Prerender und Widget-Kopierschritt Exit 0. `git diff --check` sauber.
Logs: `/root/.hermes/cache/scratch/lobby-embedding-final-{tests,typecheck,build}.log`.

## Neue Schutzänderungen

- Worker verwendet `startupEmbeddingBusinesses()` in `apps/worker/src/embeddingStartup.ts`: **default keinerlei Startup-Reembedding**. Nur exakte IDs aus `AI_EMBEDDING_STARTUP_BUSINESS_IDS`, Schnittmenge mit vorhandenen Businesses, dedupliziert. Kein Wildcard-/All-Modus; unbekannte IDs wirkungslos. Erst leer lassen! Kein bestehender Job wird dadurch gelöscht oder pausiert.
- `AI_EMBEDDING_SEARCH_TIMEOUT_MS`: default 1800ms unverändert, nur ganzzahlig 100–10000ms, ungültig fällt auf 1800ms zurück. CPU-Vorschlag 6000ms wurde mit 4200ms Regressionstest geprüft. Request erhält AbortSignal; Timeout cancelt SDK-HTTP und fällt auf lexikalische Suche zurück. Eine bereits laufende Torch-Inferenz im Dienst wird dadurch NICHT sofort unterbrochen; Single-flight bleibt bis ihrem Ende belegt.
- Runtime-Interpolation beider Variablen in `docker-compose.coolify.yml` für Admin/Worker. Startupliste nur Worker relevant.
- RED/GREEN: Startup-Allowlist-Test und Retrieval-Abbruch-/CPU-Timeout-Tests reproduzierten Fehler vor Implementierung.

Eigener begrenzter Sicherheitsreview: keine Secret-/Input-Ausgabe, kein neuer öffentlicher Port, RLS/Business-/Revision-/Fingerprintfilter unverändert, keine Schemaänderung. Providerkonfiguration ist keine Backfill-Autorisierung. Kein unabhängiger Review möglich in diesem Subagenten.

## Parent-Aktivierungsreihenfolge / verbleibende harte Gates

**Noch nicht allgemeingültig release-ready:** Chunking verwendet weiterhin 1800 Zeichen und garantiert nicht ≤512 echte Modelltokens. Bestehende lange Chunks beim Reembedding können 413 erhalten. Vor globalem Providerwechsel token-aware Ingestion UND bestehende Chunk-Neuaufbereitung in isolierter Staging-DB verifizieren. Kein stilles Abschneiden. Lokaler Modell-/SDK-/Cosinus-Test ersetzt keinen pgvector/RLS/Worker-End-to-End-Test; diese Abnahme fehlt.

1. Exakten Tree reviewen und den Chunking-/Staging-Gate schließen; Backup/Restore und Rollback festlegen. Image/Cache-Verfügbarkeit und CVE-/Supply-chain-Review prüfen. Die gesperrten Torch/Transformers-Versionen sind nicht vollständig CVE-geprüft.
2. Erst Schutzcode ohne neue Embedding-ENV deployen; Startupliste explizit leer. Coolify-App `d46nsp5mdqwkezskfeegdqvh`, Git-Compose `docker-compose.coolify.yml`. Queue prüfen, keine doppelten Deploys, vorhandene aktive Reembedding-Jobs separat read-only prüfen.
3. Privaten Dienst über `docker-compose.embeddings.yml` starten, neues echtes Secret als Runtime-Wert `EMBEDDING_BEARER_SECRET`; Cachevolume dauerhaft und Netzwerk `lobby-embedding-private`, keine Hostports/Proxy-Anbindung. Build-Compose `docker-compose.embeddings.build.yml` enthält keine Secrets. Readiness/Revisionsvertrag prüfen.
4. Admin/Worker privates Netz gemäß `docker-compose.embeddings.integration.yml` anbinden (Overlay-Inhalt zuerst prüfen). Beide brauchen exakt gleiche Runtime-Settings in Coolify, nicht Buildargs:
   - `AI_EMBEDDING_BASE_URL=http://embeddings:8080/v1`
   - `AI_EMBEDDING_MODEL=gte-local`
   - `AI_EMBEDDING_PROVIDER_NAME=local-gte`
   - `AI_EMBEDDING_REVISION=a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644-bf16-lasttoken-noncausal-512-v1`
   - `AI_EMBEDDING_API_KEY` gleich Runtime-Bearer des Dienstes
   - `AI_EMBEDDING_MAX_PARALLEL_CALLS=1`, `AI_EMBEDDING_MAX_BATCH_SIZE=1`
   - `AI_EMBEDDING_TIMEOUT_MS=30000`, `AI_EMBEDDING_SEARCH_TIMEOUT_MS=6000`
   - `AI_EMBEDDING_STARTUP_BUSINESS_IDS=` leer (kein globaler Backfill!)
5. Providerwechsel ändert Fingerprint: alte Vektoren sind dann semantisch nicht nutzbar, lexikalischer Fallback bleibt. Deshalb keine unkontrollierte globale Umschaltung vor Canary-/Migrationplan. Eine explizit freigegebene Canary-ID kann in der Startupliste einmalig angegeben werden; anschließend wieder entfernen. Tests/Backup vor diesem Datenmutationsschritt.
6. Readback exakter Live-Containerkonfiguration ohne Secrets, Diensthealth, Admin/Workerhealth, öffentliche Fixture-Ingestion/DB-Vektoren/semantische Treffer und Fehler-/Konkurrenzpfade prüfen. Keine Kundenrecords als ungefragten Test verwenden. 429 während Ingestion bleibt ein dokumentierter Fallback; Qualitäts-/Lastkorpus ist noch offen.
