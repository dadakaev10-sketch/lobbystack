# Bring-your-own-agent knowledge import

## Scope approved in chat
Add an optional entry next to website/file/text knowledge sources. User uses their own agent, copies a website-specific safe research prompt, then imports a reviewed Markdown/TXT file or pasted text. No OAuth, paid calls, account/onboarding changes, database migration or Firecrawl changes.

## Implementation
1. Pure prompt generator with bounded fields/public HTTP URL syntax; no outgoing request. Prompt treats web content as untrusted, requires sources/unknowns, forbids private data and side-effect actions.
2. Accessible dialog: website/company, prompt copy fallback, file or text input, inert text preview and explicit review checkbox. UTF-8 text/Markdown only, bounded 256 KiB, fail closed on invalid bytes/empty file. File names are not rendered as HTML.
3. Reuse existing uploadKnowledgeDocument authorization/storage/import pipeline after review. Do not claim embeddings are configured. Hide entry from non-manager roles just like existing sources.
4. Feature-specific unit/component tests, existing knowledge regressions and typecheck/build. Work on feature branch; no main push/deployment without release approval.

## Acceptance
Prompt contains exact verified URL/company and safety rules. Clipboard failures provide manual text fallback. Selection/paste change clears confirmation. No upload before explicit confirmation. Preview does not execute HTML or fetch links. Failed saves keep input. Existing website/upload/text behavior is preserved. User account/onboarding untouched.
