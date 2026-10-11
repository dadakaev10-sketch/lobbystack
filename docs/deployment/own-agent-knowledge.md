# Knowledge prepared with the user's own agent

## Operator flow
In **Agent → Knowledge → Add knowledge → Prepare with your own AI agent**, a business owner/admin can:
1. Edit the current business name/website and generate a source-grounded research prompt.
2. Copy it into their own external agent. Clipboard denial keeps the prompt selectable for manual copying.
3. Select a UTF-8 `.md`/`.txt` file (maximum 256 KiB), or paste the agent's Markdown.
4. Review a literal, inert text preview and explicitly approve it.
5. Submit it as `unternehmenswissen.md` through the same `uploadKnowledgeDocument` pipeline used for document uploads, tagged `own-agent`.

No provider login, token, paid request, crawling, onboarding update or automatic account change is performed by prompt generation or preview. Prompt instructions prohibit fabrications, secrets/private client data and external side effects, require source URLs and open questions, and distinguish source material from system instructions. The existing receptionist instructions already classify knowledge passages as reference data, not instructions.

The file picker checks extension, byte limit, UTF-8 validity, empty/binary-control content. Paste uses a UTF-8 byte limit too. Any content change clears review approval. HTML/Markdown is not rendered or evaluated in preview. File-read versioning prevents an older selection from overwriting later pasted text. The UI limit supplements, not replaces, existing authenticated backend storage limits and business authorization.

## Boundaries
- Website URL validation is syntactic only; no DNS lookup/network request is made by this feature. External agents must independently follow their own network protections.
- Approval means the user reviewed the knowledge; it is not proof that the facts are correct.
- Successful document upload does **not** prove indexing, retrieval or AI responses. Embeddings remain a separately configured dependency, visibly disclosed in the dialog.
- Labels use the existing English/French/Spanish/Serbian UI locales. The supplied research prompt is German.
- The user account/onboarding and the private Firecrawl deployment remain unchanged.

## Verification
- Prompt and validation unit tests, dialog file/paste/approval/failure/clipboard tests, menu role checks and existing knowledge regressions: **51 passing tests** across four files.
- Admin TypeScript check and changed-file ESLint: passed.
- Workspace dependency builds and optimized Next.js production build: passed, 56 static pages generated.
- Component integration tests use isolated test callbacks; no real customer document was uploaded and no live indexing was claimed.
- Changes are on local branch `feature/own-agent-knowledge`. Push/deployment require current explicit release Go.

Commands:
```sh
pnpm --filter @lobbystack/admin exec vitest run src/lib/own-agent-knowledge.test.ts src/components/own-agent-knowledge-sheet.test.tsx src/components/live-knowledge-surface.test.tsx src/components/knowledge-forms.test.tsx
pnpm --filter @lobbystack/admin exec tsc --noEmit
pnpm --filter '@lobbystack/admin^...' --workspace-concurrency=2 -r build
NODE_OPTIONS=--max-old-space-size=3072 RAYON_NUM_THREADS=2 pnpm --filter @lobbystack/admin build
```
