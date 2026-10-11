"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { buildOwnAgentKnowledgePrompt, decodeOwnAgentKnowledgeFile, OWN_AGENT_MAX_BYTES, validateOwnAgentKnowledgeText } from "@/lib/own-agent-knowledge";
import { uploadErrorMessage } from "@/lib/storage-upload";

export function OwnAgentKnowledgeSheet({ open, onOpenChange, upload, companyName = "", initialWebsiteUrl = "" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName?: string;
  initialWebsiteUrl?: string;
  upload: (input: { file: File; contentType: string; title: string; tags: string[] }) => Promise<void>;
}) {
  const { t } = useTranslation("knowledge");
  const label = (key: string, fallback: string) => t(`agentAssist.${key}`, { defaultValue: fallback });
  const id = useId();
  const selection = useRef(0);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [company, setCompany] = useState(companyName);
  const [prompt, setPrompt] = useState("");
  const [content, setContent] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  let validText = "";
  try { validText = validateOwnAgentKnowledgeText(content); } catch { /* Invalid/empty content cannot be submitted. */ }

  useEffect(() => {
    selection.current += 1;
    setWebsiteUrl(initialWebsiteUrl); setCompany(companyName); setPrompt(""); setContent("");
    setConfirmed(false); setSaving(false); setReading(false); setError(""); setNotice("");
  }, [open, companyName, initialWebsiteUrl]);

  function updateContent(value: string) {
    selection.current += 1;
    setReading(false); setContent(value); setConfirmed(false); setError("");
    if (value.trim()) {
      try { validateOwnAgentKnowledgeText(value); }
      catch { setError(label("invalidText", "Use nonempty UTF-8 text up to 256 KiB, without binary control characters.")); }
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice(label("copied", "Prompt copied. Paste it into your own agent."));
    } catch { setNotice(label("copyFallback", "Clipboard unavailable. Select and copy the prompt below manually.")); }
  }

  function selectFile(file: File | undefined) {
    const version = ++selection.current;
    setContent(""); setConfirmed(false); setError(""); setReading(false);
    if (!file) return;
    if (!/\.(md|txt)$/iu.test(file.name) || file.size > OWN_AGENT_MAX_BYTES) {
      setError(label("invalidFile", "Choose a UTF-8 .md or .txt file up to 256 KiB.")); return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (version !== selection.current) return;
      try {
        if (!(reader.result instanceof ArrayBuffer)) throw new Error("invalidFile");
        setContent(decodeOwnAgentKnowledgeFile(file.name, new Uint8Array(reader.result)));
      } catch { setError(label("invalidFile", "Choose a UTF-8 .md or .txt file up to 256 KiB.")); }
      setReading(false);
    };
    reader.onerror = () => {
      if (version !== selection.current) return;
      setReading(false); setError(label("invalidFile", "Choose a UTF-8 .md or .txt file up to 256 KiB."));
    };
    reader.readAsArrayBuffer(file);
  }

  async function importKnowledge() {
    if (!confirmed || saving || reading || !validText) return;
    setSaving(true); setError("");
    try {
      await upload({ file: new File([validText], "unternehmenswissen.md", { type: "text/markdown" }), contentType: "text/markdown", title: company.trim() || "Unternehmenswissen", tags: ["own-agent"] });
      onOpenChange(false);
    } catch (cause) {
      setError(uploadErrorMessage(cause, label("importFailed", "Import failed. Your text is still here; please try again.")));
    } finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={next => { if (!saving) { selection.current += 1; onOpenChange(next); } }}>
    <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{label("title", "Prepare knowledge with your own AI agent")}</DialogTitle>
        <DialogDescription>{label("description", "Use your own ChatGPT, Claude or Hermes account. No login credentials are shared with LobbyStack. Check the result before importing it.")}</DialogDescription>
      </DialogHeader>
      <fieldset className="flex flex-col gap-4" disabled={saving}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><label htmlFor={`${id}-website`} className="text-sm font-medium">{label("website", "Website")}</label><Input id={`${id}-website`} type="url" maxLength={2048} placeholder="https://example.com" value={websiteUrl} onChange={event => {setWebsiteUrl(event.target.value);setPrompt("");setNotice("");}} /></div>
          <div className="space-y-2"><label htmlFor={`${id}-company`} className="text-sm font-medium">{label("company", "Company name")}</label><Input id={`${id}-company`} maxLength={160} value={company} onChange={event => {setCompany(event.target.value);setPrompt("");setNotice("");}} /></div>
        </div>
        <Button variant="outline" type="button" onClick={() => {
          try { setPrompt(buildOwnAgentKnowledgePrompt({ websiteUrl, companyName: company }));setError("");setNotice(""); }
          catch { setError(label("invalidUrl", "Enter a full HTTP(S) website URL without login credentials.")); }
        }}>{label("generate", "Generate prompt")}</Button>
        {prompt ? <div className="space-y-2">
          <label htmlFor={`${id}-prompt`} className="text-sm font-medium">{label("prompt", "Prompt")}</label>
          <Textarea id={`${id}-prompt`} readOnly value={prompt} className="h-40 overflow-y-auto font-mono text-xs" />
          <Button variant="outline" type="button" onClick={() => void copyPrompt()}>{label("copy", "Copy prompt")}</Button>
          <p role="status" className="text-sm text-muted-foreground">{notice}</p>
        </div> : null}
        <p className="text-sm text-muted-foreground">{label("next", "Run the prompt in your agent, then upload its file or paste the Markdown below. Nothing is imported automatically.")}</p>
        <div className="space-y-2"><label htmlFor={`${id}-file`} className="text-sm font-medium">{label("file", "Agent’s Markdown or text file")}</label><Input id={`${id}-file`} type="file" accept=".md,.txt,text/markdown,text/plain" onChange={event => {selectFile(event.target.files?.[0]);event.target.value="";}} /></div>
        <div className="space-y-2"><label htmlFor={`${id}-content`} className="text-sm font-medium">{label("paste", "Paste the agent’s Markdown")}</label><Textarea id={`${id}-content`} value={content} maxLength={OWN_AGENT_MAX_BYTES} className="h-40 overflow-y-auto" onChange={event => updateContent(event.target.value)} /></div>
        {content ? <pre aria-label={label("preview", "Knowledge preview")} className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 text-xs">{content}</pre> : null}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={!validText || reading} onChange={event => setConfirmed(event.target.checked)} /><span>{label("confirm", "I checked the facts and sources, removed private information, and approve this content as company knowledge — not system instructions.")}</span></label>
        <p className="text-xs text-muted-foreground">{label("indexing", "This uses the existing document import. Search indexing still requires a configured embedding provider; this does not connect your agent or enable paid AI.")}</p>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter><Button type="button" disabled={!confirmed || !validText || saving || reading} onClick={() => void importKnowledge()}>{saving ? label("importing", "Importing…") : label("import", "Import reviewed knowledge")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
