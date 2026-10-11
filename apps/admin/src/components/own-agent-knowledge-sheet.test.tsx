// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnAgentKnowledgeSheet } from "./own-agent-knowledge-sheet";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("own-agent knowledge import", () => {
  it("requires explicit review, previews inert text, and uploads through the existing file callback", async () => {
    const upload=vi.fn<(input: {file: File; contentType: string; tags: string[]}) => Promise<void>>().mockResolvedValue(undefined),close=vi.fn();
    render(<OwnAgentKnowledgeSheet open companyName="Clinic" upload={upload} onOpenChange={close} />);
    fireEvent.change(screen.getByLabelText("Website"),{target:{value:"https://example.com"}});
    fireEvent.click(screen.getByRole("button",{name:"Generate prompt"}));
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toContain("https://example.com");
    const body='# Clinic\n\nHours: 9–17\n<script>window.compromised=true</script>';
    fireEvent.change(screen.getByLabelText("Paste the agent’s Markdown"),{target:{value:body}});
    expect(screen.getByLabelText("Knowledge preview").textContent).toContain('<script>');
    expect(screen.getByLabelText("Knowledge preview").querySelector("script")).toBeNull();
    const submit=screen.getByRole("button",{name:"Import reviewed knowledge"}) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);
    await waitFor(()=>expect(upload).toHaveBeenCalledOnce());
    const value=upload.mock.calls[0]![0];
    expect(value.file.name).toBe('unternehmenswissen.md');
    expect(value.contentType).toBe('text/markdown');
    expect(value.tags).toEqual(['own-agent']);
    expect(close).toHaveBeenCalledWith(false);
  });
  it('clears approval when content changes and retains input after failed upload', async () => {
    const upload=vi.fn().mockRejectedValue(new Error('private server detail')),close=vi.fn();
    render(<OwnAgentKnowledgeSheet open upload={upload} onOpenChange={close} />);
    const text=screen.getByLabelText('Paste the agent’s Markdown');
    fireEvent.change(text,{target:{value:'# Hours'}});
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(text,{target:{value:'# Changed hours'}});
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'Import reviewed knowledge'}));
    await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Import failed'));
    expect((text as HTMLTextAreaElement).value).toBe('# Changed hours');
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).not.toContain('private server detail');
  });
  it('reads UTF-8 Markdown files into a reviewable preview',async () => {
    const upload=vi.fn();
    render(<OwnAgentKnowledgeSheet open upload={upload} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Agent’s Markdown or text file'),{target:{files:[new File(['# Öffnungszeiten'],'wissen.md',{type:'text/markdown'})]}});
    await waitFor(()=>expect((screen.getByLabelText('Paste the agent’s Markdown') as HTMLTextAreaElement).value).toBe('# Öffnungszeiten'));
    expect((screen.getByRole('button',{name:'Import reviewed knowledge'}) as HTMLButtonElement).disabled).toBe(true);
    expect(upload).not.toHaveBeenCalled();
  });
  it('rejects unsupported and malformed file content without upload',async () => {
    const upload=vi.fn();
    render(<OwnAgentKnowledgeSheet open upload={upload} onOpenChange={vi.fn()} />);
    const picker=screen.getByLabelText('Agent’s Markdown or text file');
    fireEvent.change(picker,{target:{files:[new File(['<svg/>'],'payload.svg')]}});
    expect(screen.getByRole('alert').textContent).toContain('UTF-8');
    fireEvent.change(picker,{target:{files:[new File([new Uint8Array([0xff,0xfe])],'bad.md')]}});
    await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('UTF-8'));
    expect((screen.getByLabelText('Paste the agent’s Markdown') as HTMLTextAreaElement).value).toBe('');
    expect(upload).not.toHaveBeenCalled();
  });
  it('provides manual copy fallback and invalidates an outdated generated prompt',async () => {
    render(<OwnAgentKnowledgeSheet open companyName='Clinic' initialWebsiteUrl='https://example.com' upload={vi.fn()} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button',{name:'Generate prompt'}));
    fireEvent.click(screen.getByRole('button',{name:'Copy prompt'}));
    await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('manually'));
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toContain('Clinic');
    fireEvent.change(screen.getByLabelText('Website'),{target:{value:'https://other.example.com'}});
    expect(screen.queryByLabelText('Prompt')).toBeNull();
  });
});
