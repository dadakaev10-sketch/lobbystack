# Lokaler Embedding-Prototyp — Plan vor Umsetzung

> Historischer Prototypbericht; aktuelle Runtime-Versionen, Security-Dispositionen und Abnahme: [local-embeddings-security.md](local-embeddings-security.md). Historische Hashes/Messwerte unten sind keine Freigabe des alten Images.

Scope: neue Branch feat/local-native-embeddings, keine Pushes, Aktivierung, Kundenrecords oder DB-Migrationen. Native 1536 Dimensionen bleiben unverändert.

Modellkandidat: Alibaba-NLP/gte-Qwen2-1.5B-instruct, Hugging Face Revision a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644, Apache-2.0 laut offizieller Model Card. config.json bestätigt hidden_size=1536 und bidirektionale Aufmerksamkeit (is_causal=false). Remote-Code muss gepinnt und gehasht geprüft werden; kein ungeprüfter main-Code.

Implementierungsplan: isolierter CPU-Service mit OpenAI-kompatiblem /v1/embeddings, echtem Runtime-Bearer-Secret, maximal einem laufenden Request, sequenziellen Inputs, begrenzten Bytes/Tokens/Batch, privaten Ports, persistentem Modellcache. Health/Readiness, fail-closed Auth und Modellvertrag testen. CPU 2, RAM höchstens 6 GiB, Swap aus; keine anderen Container verändern. Modell BF16 laden, Safetensors, Last-token-Pooling gemäß Model Card, L2-Normalisierung; kein Padding/Projektion der Dimensionen.

Bestehender Vertrag: EmbeddingProvider normalisiert exakt 1536 endliche Nichtnullwerte; Fingerprint SHA256 bindet URL/Modell/Provider/Dimension/Revision. DB vector(1536), abgeschlossene Chunks und matching Fingerprint in semantischer Suche. Dokumentrevision/Chunkindex bleiben unverändert. Admin und Worker nutzen denselben Provider. Explizit leere API_KEY und festes MODEL in Coolify-Compose blockieren Runtime-Konfiguration: additive Interpolation ohne neue Live-Werte vorbereiten. Retrieval hat derzeit harte 1800ms semantisches Timeout: CPU-Latenz messen, nicht unbewiesen als Live-ready darstellen.

Verifikation: Tests zuerst, echte öffentliche dadakaev.com Quellen (mit Hash) lokal einbetten und umformulierte deutsche Frage gegen lokale Cosinus-Rangliste prüfen. Keine Produktivdatenbank. Danach Provider-/Konfigurationstests, Typecheck/Build, eigener Review; Parent-Review und explizites Release-Go bleiben Voraussetzung.

## Ergebnis und Provenienz

- Echtes natives Modell erfolgreich: 1536 endliche, L2-normalisierte Dimensionen; keine Fakevektoren, Projektion oder Dimensionen-Padding. BF16-Inferenz auf CPU, bidirektionale SDPA-Aufmerksamkeit, Last-token-Pooling, kein LM-Head.
- Quelle: https://huggingface.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct/tree/a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644 . Model Card bestätigt multilingual, 1536 und Apache-2.0. Die gemischten MTEB-Tabellen der Card wurden nicht als eigene Messergebnisse ausgegeben.
- `services/embeddings/modeling_qwen.py` ist unveränderter, vollständig gelesener Upstream-Code dieser Revision; SHA256 `99ba535c53fb52c61067ddbc7f70e0b877ec3a2aa53bd89a559432a3efc7f0a7`. Import-/Side-effect-Review: keine Netzwerk-/Subprocess-/Exec-Aufrufe; normale Torch/Transformers-Modellimplementierung. Direkter Import der vendorten Klasse statt `trust_remote_code=True`; Tokenizer läuft ausdrücklich mit `trust_remote_code=False`.
- Upstream-Copyright bleibt im Code; volle Apache-Lizenz liegt daneben und im Image. Prüfsummen aller geladenen Modell-/Tokenizerdateien: `local-embeddings-manifest.json`. Die FP32-Safetensors werden zur Laufzeit als BF16 geladen; keine Pickle-Gewichte. Gewichte werden nie ins Git/Image kopiert, nur in den persistenten HF-Cache.
- PyTorch `2.4.1+cpu`, Transformers `4.44.2`, Accelerate `0.34.2`; komplette tatsächlich installierte Versionen in `services/embeddings/requirements.lock`. Basisimage `python:3.11-slim-bookworm@sha256:0a310eeecf4e1f5a0743f9a6520c90c88d089c903ca5fd283f501e3a805f5f89`.
- Lokales getestetes Image: `sha256:bd18828414cc3df3d8d2e24fcfb4524e0a01f4097ff385d35508f4ccafa2b282` (`lobbystack-local-embeddings:gte-a9af15a`).

## Dienstvertrag und Limits

`POST /v1/embeddings`: OpenAI-kompatible JSON-API, Modellalias `gte-local`, float-Ausgabe, native 1536 Dimensionen, `usage.prompt_tokens/total_tokens`. String oder Stringliste, höchstens 8 Inputs, sequenziell verarbeitet; maximal 512 echte Tokens pro Input, 16000 Zeichen, 65536 Bodybytes, 5s Body-Lesezeit. Überlänge wird mit 413 abgelehnt, niemals still abgeschnitten. Eine aktive Anfrage insgesamt (einschließlich Bodyread); konkurrierende Requests erhalten 429 + Retry-After, kein unbeschränktes Queueing. Auth vor Bodyread, Runtime-Secret mindestens 32 Zeichen, konstanter Zeitvergleich, 401 ohne gültigen Bearer.

`GET /health/live` und `/health/ready`; Readiness bestätigt Revision und Dimension. Uvicorn startet den Listener erst nach erfolgreichem Modellladen, daher sind beide während Cold-start noch nicht erreichbar. Docker-Healthcheck hat 600s Startperiode. Requests/Inputs/Secrets werden nicht geloggt; Fehlerantworten sind generisch. Keine CORS/öffentliches Routing/Host-Portpublikation.

Compose effektiv geprüft: 2 CPU, 6 GiB RAM, `memswap_limit=mem_limit` (0 zusätzliche Swap), pids_limit 128, readonly-root, cap_drop ALL, no-new-privileges, UID/GID 1000:1000, temporäres 64MiB tmpfs. PortBindings `{}`. Cachevolume: `lobby-embedding-probe_embedding_cache`; Netz `lobby-embedding-private` (kein Proxy-Netz). Cold-start darf HTTPS zu Hugging Face verwenden; das Bridge-Netz ist nicht `internal:true`. Die Funktion `config.max_position_embeddings=512` reduziert ausschließlich die großen RoPE-Caches, ändert keine Gewichte/Frequenzen und passt zum hart geprüften Tokenlimit.

## Tatsächliche Messwerte

Öffentliche Quelle https://dadakaev.com, vier wörtliche englische Passagen: Automation, Telefonassistenten, Preise, Launch. Fixture mit Quellenvermerk: `services/embeddings/retrieval-fixture.json`, SHA256 `be17fba4d40aaea9d951d1fa2e46113beba32a8d09e55ceaff6f2aa2b8b5ea2a`. Deutsche anders formulierte Frage: „Wie lassen sich meine bestehenden Programme verbinden, damit niemand mehr Daten von Hand übertragen muss?“

Echtes lokales Cosinus-Retrieval liefert **Automation Rang 1**, 0.34585404645704854, vor Telefon 0.2866354987133185, Preise 0.2294564683104163, Launch 0.22649210127361386. Letzter finaler Lauf: Frage 448.65ms/24 Tokens, Passagen 295.79–540.40ms. Vektorhash reproduzierbar über mehrere Image-Neustarts: `6f39ab28c08639bf800cd096a9c0b48290675ff626e6252a50a4fb1bef3ff508`. Roh-Ranking, Quellen, Text-/Vektorhashes und Latenzen: `local-embeddings-retrieval.json`.

Realistischer Belastungsprobe aus wiederholtem öffentlichem Text: 1800 Zeichen / 357 Tokens = 3780.91ms; exakt 512 Tokens = 4533.75ms. Anonymer RAM 3638562816 Bytes, Dateicache 2298134528 Bytes, Peak 5952311296 Bytes, oom/oom_kill/max=0, Swap=0 im finalen Benchmark (`local-embeddings-benchmark.json`). Erster Download-/Checksum-Lauf erreichte die 6GiB-Grenze und löste Cache-Reclaim (`memory.events.max`) aus, aber **kein OOM/kein OOM-Kill**, ebenfalls 0 Swap (`local-embeddings-manifest.json`). Dies ist ein kleiner funktionierender CPU-Prototyp, keine Kapazitätszusage für parallelen Live-Betrieb.

Der reale LobbyStack-Provider mit der neuen optionalen Batchbegrenzung wurde über den privaten Container-IP-Endpunkt mit dem tatsächlichen AI SDK geprüft: zwei echte Vektoren, 1536 Dimensionen, Cosinus 0.4577497183530334; Fingerprint `0d0e3b874c32291c799ee5cae86a7aca8c3e790dec9f00eae39a99b3fc14ae01` für die damalige Probe-IP. Die reale Dienst-URL ist Teil des Fingerprints: dieser Probehash darf nicht für spätere Live-Chunks übernommen werden.

## Vorbereitete Integration — nicht aktiviert

- `docker-compose.coolify.yml`: API_KEY und MODEL werden statt explizit leer/fest jetzt erst zur Laufzeit interpoliert, zusätzlich Timeout/Parallelität/Batchgröße. Defaults erhalten das bisherige Verhalten; **keine Live-ENV geändert**.
- Provider unterstützt optional `AI_EMBEDDING_MAX_BATCH_SIZE` und zerlegt große Wertearrays sequenziell; dies passt auch zu den 64er-Reembedding-Batches im Worker. Ohne Konfiguration bleibt das alte Verhalten. Ungültige Batchgrößen schlagen geschlossen fehl. Timeout gilt pro Teilbatch.
- Separates git-backed Runtime-Compose: `docker-compose.embeddings.yml`. Secret-freies Build-Compose: `docker-compose.embeddings.build.yml`. Die optionale `docker-compose.embeddings.integration.yml` verbindet nur Admin/Worker mit dem privaten Modellnetz; sie wurde nicht an einen Live-Stack angewandt.
- Vorgeschlagene Runtime-Werte (erst nach Release-Go): BASE_URL `http://embeddings:8080/v1`, MODEL `gte-local`, PROVIDER_NAME `local-gte`, REVISION `a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644-bf16-lasttoken-noncausal-512-v1`, MAX_PARALLEL_CALLS `1`, MAX_BATCH_SIZE `1`, TIMEOUT_MS `30000`. API_KEY muss dasselbe echte neue Runtime-Bearer-Secret wie im Dienst sein, nie ein Platzhalter/Buildarg.
- Fingerprint beinhaltet URL, Alias, Provider, 1536 und Revision. Raw-Text-Betrieb: kein query-only Instruction-Präfix, da LobbyStack momentan Query und Dokument über denselben `embed()`-Vertrag sendet. Eine spätere getrennte query/document API muss evaluiert und durch eine neue Revision abgegrenzt werden.
- Suche: Business-/RLS-Grenzen, aktive/indexierte Dokumente, abgeschlossene Chunks, matching Fingerprint, semantischer Cosinus plus lexikalische RRF-Fusion; nach paralleler Suche nochmal aktuelle Dokumentrevisionen und Nachbar-Chunks geprüft. Unverändert gelassen, keine Schemaänderung/Migration.

## Gates und konkrete offene Punkte vor Live-Go

1. **Automatisches Reembedding ist eine Datenmutation:** `apps/worker/src/index.ts:276–288` enqueued bei konfiguriertem Provider für alle Businesses `knowledge.reembedBusiness`. Ein Worker-Neustart mit neuen Werten ist daher nicht bloß Konfiguration. Vor Produktions-Go zuerst explizites Startup-/Canary-Gate und kontrollierten Backfillplan implementieren/reviewen, mit Backup und separater Nutzerfreigabe. Hier wurde weder ein Worker neu gestartet noch ein Job/Retry ausgelöst.
2. Der bestehende Chunker verwendet 1800 **Zeichen**, nicht Tokens; dies garantiert nicht ≤512 Tokens, insbesondere bei multilingualen Daten. Vor Live-Import token-aware Chunking oder separat begründet/ressourcengeprüft höheres Limit vorbereiten. Ablehnung langer Inputs ist absichtlich sicher und verhindert Datenverlust durch Trunkierung.
3. Semantische Suche hat harte 1800ms, während große Queries 3–4.5s brauchen. Kleine Testfrage passt, lange Queries nicht. Vor Live-Go Timeout-/Budget-/Cancellation-Design überprüfen, Querylängen und Ingestion-Konkurrenz testen; 429 während Ingestion kann vorerst zur lexikalischen Suche führen. Kein unüberprüftes Timeout-Tuning hier.
4. Qualitäts-/Lasttests mit mehrsprachigem Referenzkorpus, query-only Instruction-Auswertung, Sicherheitsscan der gepinnten älteren Torch/Transformers-Versionen und Supply-chain-Härtung (Wheel-Hashes) bleiben Release-Gates. Versionslock und Safetensors verringern Risiken, sind kein vollständiger CVE-Audit.
5. Kein pgvector-/RLS-End-to-End gegen echte DB ausgeführt; der reale Modell/SDK/Retrieval-Test ist rein lokal und hält Quellen fest. Vor Live-Integration eine isolierte Staging-DB/Redis mit öffentlichen Fixtures nutzen; Produktiv-Records/Onboarding bleiben unangetastet.
6. Parent-Review und explizites Push/Deploy-/Aktivierungs-Go fehlen. Nicht als release-ready bezeichnen.

## Reproduzierbare Befehle und Prüfungen

Aus Repo-Root, nur isolierte Probe:

```sh
# Build ist unabhängig von Runtime-Secrets. Quoten auch während pip-Installation:
DOCKER_BUILDKIT=0 docker build --memory=2g --memory-swap=2g \
  --cpu-period=100000 --cpu-quota=100000 \
  -t lobbystack-local-embeddings:gte-a9af15a services/embeddings
# Kein Secret ausgeben oder ins Repo schreiben:
export EMBEDDING_BEARER_SECRET=$(openssl rand -hex 32)
docker compose -p lobby-embedding-probe -f docker-compose.embeddings.yml \
  up -d --no-build --wait --wait-timeout 180
docker exec lobby-embedding-probe-embeddings-1 python -m unittest test_contract test_http
docker exec lobby-embedding-probe-embeddings-1 python verify_retrieval.py
docker exec lobby-embedding-probe-embeddings-1 python benchmark.py
docker exec lobby-embedding-probe-embeddings-1 python cache_manifest.py
export EMBEDDING_PROBE_BASE_URL=http://$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' lobby-embedding-probe-embeddings-1):8080/v1
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/local-embedding-probe.ts
docker stop lobby-embedding-probe-embeddings-1
unset EMBEDDING_BEARER_SECRET EMBEDDING_PROBE_BASE_URL
```

Test-first belegt: fehlendes `contract` → implementiert → grün; Batch-Regression zeigte ein unzerlegtes Array → implementiert → grün; Compose-Test scheiterte an explizit leerem API_KEY → Runtime-Interpolation → grün; echter Slow-body-Test scheiterte mit 8s Socket-Timeout → 5s Bodybudget → 408, zusätzlich 429 während Request → grün. Nur die Provider-Unit-Tests mocken SDK-Antworten; Dienst/SDK-Abnahme/Retrieval verwenden echte Modellgewichte.

Final geprüft: **9 Diensttests**, **2704 Workspace-/Scripttests bestanden, 181 DB-/Integrationstests übersprungen**, **2 Build-Konfigurationstests bestanden**. Komplettes Workspace-Build inkl. Next.js 16.3.8/Turbopack, Worker und Prerenderprüfung: Exit 0, 32 lokalisierte öffentliche Routen geprüft. Typecheck aller Workspaces/Scripts: nach begrenztem 4GiB-Parallelversuch (SIGTERM) erfolgreich sequenziell mit 6GiB/0Swap/2CPU. `git diff --check` sauber. App-Befehle: `pnpm -r --workspace-concurrency=1 typecheck`, `pnpm typecheck:scripts`, `pnpm -r --workspace-concurrency=1 test`, `pnpm test:scripts`, `pnpm test:build-config`, `pnpm -r --workspace-concurrency=1 build`, `pnpm admin:prerender-check`, `node scripts/copy-widget-embed.mjs`. Ausgeführt in systemd-Scope mit MemoryMax=6G, MemorySwapMax=0, CPUQuota=200%.

Durable Ausführungslogs: `/root/.hermes/cache/scratch/lobby-embedding-tests-final.log`, `/root/.hermes/cache/scratch/lobby-embedding-build.log`; strukturierte Gates `local-embeddings-validation.json`. Logs enthalten erwartete Negativ-Testwarnungen, nicht nur stilles Happy-path-Verhalten.

Zum Abschluss ist der Probecontainer **gestoppt**; lokales Image und persistenter Modellcache bleiben für den Parent. Kein Push, kein Deploy, keine Coolify-/Proxy-/Firecrawl-/Produktiv-DB-/Kunden-/Hermes-Runtime-Konfigurationsänderung.
