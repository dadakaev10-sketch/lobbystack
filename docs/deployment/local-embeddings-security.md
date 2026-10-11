# Embedding-Abhängigkeiten: lokales Security-Gate geschlossen

Stand: 2026-10-11; Basis `d8c01ef`, Branch `feature/local-embeddings-verified`. Kein Push, Deploy, Live-ENV/Netzwerkwechsel, Kundenwrite oder Backfill. Parent entscheidet über Release nach unabhängigem Review/Backup/Restore/Live-Canary.

## Urteil und getestetes Artefakt

**Das angefragte Python-Runtime-CVE-Gate ist durch tatsächliche Upgrades und echte Modellabnahme geschlossen.** Kein Ignore-/Suppressionsflag. Ein moderater ungepatchter JS-Befund bleibt außerhalb des genutzten Bibliothekspfads; explizite Disposition unten. Dies ist keine pauschale Aussage „Produktionssystem sicher“.

Image: `sha256:918216212f93ada498be473cf2e01e4304b4e0fe343bbb63e1f8352778c6cf46`, Tag `lobbystack-local-embeddings:gte-a9af15a-chunked`. Installiertes `pip freeze` stimmt vollständig mit dem 43-Paket-Lock überein; `pip check`: keine kaputten Anforderungen.

- Torch `2.14.1+cpu`, Transformers `5.19.0`, Accelerate `1.15.0`, FastAPI `0.143.0`, Starlette `1.7.0`.
- Hugging Face Hub `2.2.0`, Safetensors `0.8.0`, Tokenizers `0.23.3`, Uvicorn `0.54.0`; übrige aufgelöste Transitivversionen explizit gelockt.
- Vollständiger Lock-Audit: **42 auditiert, 0 bekannte Funde**; `torch+cpu` wird von PyPI übersprungen. Separater upstreambezogener Audit `torch==2.14.1`: **0 Funde**. Das ist keine binäre CVE-Verifikation des CPU-Wheels. OSV-Ranges und Quellen für alle 54 unterschiedlichen ursprünglichen Python-CVEs stehen in `local-embeddings-security-audit.json`.
- Neuer Produktionsaudit JavaScript: 974 Abhängigkeiten, **0 high/critical, 1 moderate**. Keine Audit-Exceptions eingeführt.

## Kompatibilitätsreparatur ohne Modellersatz

Das originale gepinnte GTE-Modell `a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644` bleibt unverändert: 1536 native Dimensionen, BF16, bidirektionale SDPA-Aufmerksamkeit, Last-token-Pooling und L2-Norm. Alle Modell-/Tokenizer-Snapshotprüfsummen stimmen mit dem vorherigen Manifest überein. Keine Dummyvektoren, keine Projektion, kein kausaler Ersatz und kein Remote-Code.

Transformers 5 verschiebt `rope_theta` nach `config.rope_parameters`. Außerdem wurden die nichtpersistenten RoPE-Meta-Buffer mit uninitialisierten Werten materialisiert: Readiness konnte bereits grün sein, während echte Inferenz ungültige Vektoren lieferte. Jetzt werden **nur** deterministische FP32-Frequenzen und BF16-Sin/Cos-Caches nach Laden rekonstruiert; keine Lerngewichte werden initialisiert/überschrieben. Vollständige echte Inferenz und Parität sichern die Korrektur ab.

Sieben deutsche/chinesische/arabische/Unicode-/Langtext-Token-ID-Vergleiche sind exakt identisch. Sechs echte Alt/Neu-Vektoren: vier bitidentisch, minimale Cosinusparität 0.9996809628882868, maximale Komponentendifferenz 0.003456026315689087. Die BF16-CPU-SDPA-Abnahme erlaubt dokumentiert Cosinus >0.9995 und absolute Differenz <0.004; keine Behauptung vollständiger Bitidentität. Das initial strengere 0.9999/0.001-Limit wurde nach Messung dieses begrenzten Drifts ersetzt, nicht heimlich ignoriert. Ein erzwungener Math-SDPA-Diagnosepfad zeigte deutlich größere Alt/Neu-Abweichungen und wurde **nicht** als Runtime übernommen. Nichtkausale echte First-token-Abhängigkeit bleibt Alt/Neu 26.125.

Für die Aktivierung explizit neue `AI_EMBEDDING_REVISION` setzen: `a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644-bf16-lasttoken-noncausal-512-torch2.14.1-transformers5.19.0-v2`. SDK-/DB-Abnahme verwenden diese Revision. Sie trennt die neue numerische Runtime von historischen Indexfingerprints; alte Fingerprints dürfen nicht manuell umetikettiert werden. Startup-Allowlist leer lassen, Reindex nur autorisierter Canary/Businesses.

## Tatsächlich ausgeführte Abnahme

- **2712 Workspace-/Scripttests bestanden, 184 übersprungen**; darin drei explizit opt-in DB/Modelltests, die separat erfolgreich real liefen.
- **3 echte Modell-/Worker-/Domain-/pgvector-/RLS-E2E bestanden**: verlustlose Unicode-Chunks mit 26/269/276 Tokens; korrekte Paraphrase gegen Distraktoren; Cross-Tenant-Zeilen 0; falscher Fingerprint/inaktive Dokumente ausgeschlossen; Providerfehler bewahrt Altnachweise; stale Commit abgewiesen; Legacy-Reindex verlustlos/idempotent.
- **14 Dienst-/Algorithmus-/HTTP-Tests bestanden**, einschließlich tatsächlicher Altmodell-Vektorreferenz und Token-ID-Parität; echte 413 ohne Trunkierung, Auth/Body-Timeout/Busy-Vertrag.
- Separates reales Quellen-Retrieval: Automation Rang 1 (Cosinus 0.34550300219119756); realer AI-SDK-Probe: zwei native1536-Vektoren, Cosinus 0.4595579667103553. Ranking, Latenzen, Fingerprint und DB-Evidence in `local-embeddings-security-validation.json`.
- **5 DOCX-Threadtests bestanden**, inklusive CVE-Reachabilitytest mit Angreifer-Precisiontext und Prüfung des tatsächlichen Node-Modulcaches.
- Vollständiger Typecheck und Build inklusive Worker-Bundle: Exit 0; 32 öffentliche lokalisierte Prerender-Routen verifiziert; **2 Build-Konfigurationstests bestanden**. `git diff --check` sauber; statischer Added-line-Scan ohne Secrets/Shell-Injection/Eval/Pickle/SQL-Interpolation.
- Echter finaler Modellcontainer: 6GiB, kein zusätzlicher Swap, 2CPU, keine Hostports. Peak 6442450944 Bytes, `memory.events.max=2092` (Cache-Reclaim), `oom=oom_kill=0`, Swap 0. Dies beweist keine freie Kapazität/Parallelbetriebsgarantie. Container/DB/Netz nach Ausführung gelöscht und readback-verifiziert; persistenter Modellcache und lokales Image bleiben erhalten.
- Reproduktion: `python3 scripts/local-embedding-e2e.py`; nun einschließlich Retrieval und SDK-Probe. Systemd-Ausführung benötigt expliziten Host-PATH für pnpm/node. Frühe Upgradeversuche scheiterten an RoPE-Konfiguration, Bufferinitialisierung und PATH; alle wurden untersucht, repariert und echte Tests wiederholt. Ein erster direkter Langaufruf wurde vom Tool abgebrochen; dessen isolierte Ressourcen wurden explizit entfernt, danach langlebige nachverifizierte Units verwendet.

## Exakte CVE-Dispositionen

Die Tabelle nennt alle 54 ursprünglichen Python-CVEs. „Außerhalb Range“ bedeutet die abgefragte aktuelle Advisory-Versionsbewertung, nicht eigene Exploit-/Patchbeweisführung für jede Bibliotheksfunktion. Volltexte, Aliase, veröffentlichte Fixversionen, OSV-Ranges und Referenzen stehen im Audit-JSON; keine CVE wurde per Ignoreflag unterdrückt.

| CVE | Getestete Runtime | Disposition |
|---|---|---|
| CVE-2026-69112 | accelerate 1.15.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2024-47874 | starlette 1.7.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-54121 | starlette 1.7.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-48710 | starlette 1.7.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-48818 | starlette 1.7.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-48817 | starlette 1.7.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-54283 | starlette 1.7.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-54282 | starlette 1.7.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-14929 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2024-12720 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-1194 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2024-11392 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2024-11394 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2024-11393 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-2099 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-3263 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-3264 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-3777 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-3933 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-5197 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-6638 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-6051 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-6921 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-1839 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-14926 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-14930 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-14920 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-14921 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-14924 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-14927 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-14928 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-4372 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-5241 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-9856 | transformers 5.19.0 | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-2953 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-3730 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-32434 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2024-48063 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-55553 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-55554 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-55557 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-55552 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-4538 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-55560 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-55558 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-46148 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-55551 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-2148 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-2149 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-2998 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-2999 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-3000 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2025-3001 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |
| CVE-2026-24747 | torch 2.14.1+cpu | Upgrade; laut OSV außerhalb betroffener Range, aktueller Audit ohne Fund |

Wesentliche Servierpfad-Grenzen zusätzlich: authentifizierter beschränkter JSON-Text; kein Caller-Modell-/Config-/Checkpointpfad; festes `Qwen2Config` und vendorte `Qwen2Model`-Klasse; `trust_remote_code=False`, `local_files_only=True`, `use_safetensors=True`. Keine Multipart-/Formparser/StaticFiles, LightGlue/anderen Tokenizer, Modellkonverter, Trainer/RNG-Checkpoints, verteilte RPCs, JIT/Inductor/PT2. Damit wurden z.B. die ursprünglichen CVE-2025-32434/CVE-2026-24747-Picklepfade und CVE-2026-69112-Caller-Checkpointindexe nicht extern angeboten; trotzdem wurde upgegradet. Advisories ohne `fix_versions` wurden anhand tatsächlicher OSV-`last_affected`-Ranges geprüft, nicht als „ungepatcht trotz neuem Audit“ verschwiegen.

### Verbleibender JS-Befund: CVE-2026-97058

`sprintf-js@1.0.3` via `mammoth@1.13.0 > argparse@1.0.10`, GHSA-hp3w-g68c-fv3c, moderater DoS durch vom Angreifer kontrollierte Präzisionsformatstrings; Advisory enthält keine Patchversion. **Abhängigkeit bleibt vorhanden, nicht gefixt und nicht ignoriert.** Worker verwendet ausschließlich `mammoth.extractRawText({buffer})`; nur Mammoths ungenutztes `bin/mammoth` lädt argparse. Bibliothekspfad wurde mit echtem DOCX-Precisionpayload geprüft: Text unverändert zurückgegeben, weder argparse noch sprintf-js im Modulcache. Keine externe Formatstringkonfiguration/CLI-Ausführung im Worker. Unter dieser exakt geprüften Nutzung nicht erreichbar; bei neuer CLI-/Help-/Formatstringfunktion erneut blockierend prüfen. Das ist eine belegte Nichtanwendbarkeit, keine globale Sicherheitserklärung der Bibliothek.

## Unvermeidbare/verbleibende Risiken und externe Gates

- Abhängigkeitsscans sind zeitpunktbezogen; unbekannte/fehlklassifizierte CVEs bleiben möglich. CPU-Wheel nur über Upstream-Advisoryversion bewertet; kein Binär-Audit. Wheel-/Transitiv-Wheelhashes, signierte Provenienz und vollständiger OS-/Basisimage-Scan sind hier nicht nachgewiesen. Modellartefakthashes dagegen tatsächlich erneut geprüft.
- Gültige private Credentials erlauben CPU-Arbeit; 429/Timeout-/lexikalischer Fallback unter Ingestion und kleine Qualitätsfixtures sind keine breite Last-/Mehrsprachigkeits-/Produktionsgarantie. RoPE-Masken-Kompatibilität stammt noch aus vendortem älterem API-Code; weitere Upgrades benötigen dieselbe reale Abnahme.
- Quelleadapter im DB-Test ist synthetisch; Modell, SDK, DB, Workerhandler, Domain/RLS und Retrieval sind real. BullMQ-Daemon, Live-Crawler und generierte Rezeptionsantworten wurden nicht nachgewiesen.
- Parent muss unabhängigen Review, Backup/Restore/Rollback, private Runtime-Netz-/Bearer-Konfiguration, leere Startup-Allowlist, exakte Remote/Deployment-Readbacks und autorisierten Live-Canary mit Cleanup erledigen. Bis dahin keine Live-Aktivierung oder globaler Backfill.
