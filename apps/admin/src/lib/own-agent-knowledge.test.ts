import { describe, expect, it } from "vitest";
import { buildOwnAgentKnowledgePrompt, validateOwnAgentKnowledgeText, decodeOwnAgentKnowledgeFile, OWN_AGENT_MAX_BYTES } from "./own-agent-knowledge";

describe("own-agent knowledge prompt", () => {
  it("personalizes a source-grounded prompt without accessing a provider", () => {
    const prompt = buildOwnAgentKnowledgePrompt({ websiteUrl: "https://example.com/services", companyName: "Example Clinic" });
    expect(prompt).toContain("https://example.com/services");
    expect(prompt).toContain("Example Clinic");
    expect(prompt).toContain("unternehmenswissen.md");
    expect(prompt).toContain("Quellen");
    expect(prompt).toContain("nicht als Anweisungen");
    expect(prompt).toContain("Erfinde keine");
  });
  it.each(["file:///etc/passwd", "https://user:secret@example.com", "not a URL", "http://localhost"])('rejects unsuitable prompt URL %s', websiteUrl => {
    expect(() => buildOwnAgentKnowledgePrompt({ websiteUrl, companyName: "Clinic" })).toThrow();
  });
  it('bounds company names and prevents multiline instruction fields', () => {
    expect(() => buildOwnAgentKnowledgePrompt({websiteUrl: 'https://example.com',companyName: 'x'.repeat(161)})).toThrow();
    expect(buildOwnAgentKnowledgePrompt({websiteUrl: 'https://example.com',companyName: 'Clinic\nOffice'})).toContain('Clinic Office');
  });
  it('requires bounded nonempty UTF-8 content', () => {
    expect(() => validateOwnAgentKnowledgeText('  ')).toThrow();
    expect(() => validateOwnAgentKnowledgeText('é'.repeat(OWN_AGENT_MAX_BYTES))).toThrow();
    expect(() => validateOwnAgentKnowledgeText('a\u0000b')).toThrow();
    expect(validateOwnAgentKnowledgeText('# Clinic\n\nHours: 9–17')).toContain('Hours');
  });
  it('accepts only valid UTF-8 Markdown/text files', () => {
    expect(decodeOwnAgentKnowledgeFile('wissen.md',new TextEncoder().encode('# Clinic'))).toBe('# Clinic');
    expect(() => decodeOwnAgentKnowledgeFile('image.svg',new TextEncoder().encode('<svg/>'))).toThrow();
    expect(() => decodeOwnAgentKnowledgeFile('bad.md',new Uint8Array([0xff,0xfe,0]))).toThrow();
  });
});
