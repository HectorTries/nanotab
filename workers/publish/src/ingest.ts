// NanoTab content ingestion — upload a document, get canonical markdown back.
// Storage model: EVERYTHING is converted to markdown and ONLY the markdown is
// kept. The original file bytes are converted in-memory during the request and
// discarded immediately after successful extraction — never persisted to KV or
// R2, never served at a public URL. (Stated in /privacy.)
//
// Accepted inputs: PDF (text layer extracted via pdfjs-dist legacy build,
// main-thread), .md/.markdown/.txt (sanitised + normalised), pasted text
// (treated as markdown downstream).
// DOCX is deliberately NOT accepted: zip-container parsing adds attack surface
// for marginal gain — the caller is told to export to PDF or paste the text.

// pdfjs-dist legacy build, main-thread only (Workers have no file-backed
// workerSrc and no nested Worker): importing WorkerMessageHandler and
// exposing it as globalThis.pdfjsWorker makes getDocument use the
// main-thread message handler instead of spawning a worker.
// Pinned to 4.0.379: newer pdfjs uses static class blocks that wrangler's
// esbuild miscompiles (`this` → undefined class var at module eval).
// (unpdf was tried first and fails the same way.)
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

{
  const g = globalThis as Record<string, { WorkerMessageHandler?: unknown } | undefined>;
  g.pdfjsWorker ||= {};
  (g.pdfjsWorker as { WorkerMessageHandler?: unknown }).WorkerMessageHandler ||= WorkerMessageHandler;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_EXTRACTED_CHARS = 200_000; // extracted-text ceiling (typical docs: 5-20 KB)
export const UPLOAD_LIMIT_PER_MINUTE = 3;
export const UPLOAD_LIMIT_PER_HOUR = 10;

export const NO_TEXT_MESSAGE = 'This PDF has no selectable text — paste the text instead.';

export class IngestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Minimal KV surface for rate limiting (the Worker's KVNamespace satisfies this).
export interface RateKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

// --- normalisation -----------------------------------------------------------
// Canonical markdown shape: LF line endings, no trailing whitespace per line,
// at most two consecutive blank lines, control characters stripped (tab kept),
// exactly one trailing newline on non-empty input.
export function normalizeMarkdown(input: string): string {
  let s = input.replace(/\r\n?/g, '\n');
  // Strip NUL and C0/C1 controls except \n and \t (hostile bytes, zero meaning).
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  s = s.split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n');
  s = s.replace(/\n{4,}/g, '\n\n\n');
  s = s.trim();
  return s ? `${s}\n` : '';
}

// --- sanitisation ------------------------------------------------------------
// Strips dangerous embedded HTML from markdown. Deliberately a byte-identical
// no-op on benign markdown (no HTML, no javascript: links): the canonical
// record must never be mangled, only made unrenderable-as-attack. Idempotent.
export function sanitizeMarkdown(md: string): string {
  let s = md;
  // Active/dangerous elements: drop the whole block including contents.
  s = s.replace(/<(script|style|iframe|object|embed|form|input|button|link|meta|base)[\s>][\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<\/(script|style|iframe|object|embed|form|input|button|link|meta|base)\s*>/gi, '');
  s = s.replace(/<(script|style|iframe|object|embed|form|input|button|link|meta|base)(\s[^<>]*)?\/?>/gi, '');
  // Event-handler attributes on any surviving tag (onclick, onerror, ...).
  s = s.replace(/(\s)on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '$1');
  // javascript:/vbscript: link targets, markdown-style and HTML-attribute-style.
  s = s.replace(/(\]\(\s*)(javascript|vbscript)\s*:/gi, '$1#blocked:');
  s = s.replace(/((?:href|src|xlink:href)\s*=\s*["']?)(javascript|vbscript)\s*:/gi, '$1#blocked:');
  s = s.replace(/((?:href|src)\s*=\s*["']?)\s*data\s*:\s*text\/html/gi, '$1#blocked-data:');
  return s;
}

// --- title -------------------------------------------------------------------
// First markdown heading, else PDF metadata title, else filename stem.
export function deriveTitle(markdown: string, opts?: { filename?: string; pdfTitle?: string }): string {
  const lines = markdown.split('\n');
  for (const line of lines) {
    const m = /^\s{0,3}#{1,6}\s+(.+)$/.exec(line);
    if (m) {
      const t = m[1].replace(/\s+#+\s*$/, '').trim();
      if (t) return t.slice(0, 200);
    }
  }
  const meta = (opts?.pdfTitle ?? '').trim();
  if (meta) return meta.slice(0, 200);
  const base = (opts?.filename ?? '').split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/\.[^.]{1,10}$/, '').trim();
  if (stem) return stem.slice(0, 200);
  return 'Untitled document';
}

export function countWords(text: string): number {
  const stripped = text.replace(/[#*_`>\-\[\]()|~+=]/g, ' ');
  const words = stripped.split(/\s+/).filter(Boolean);
  return words.length;
}

// --- file sniffing (treat uploads as hostile) --------------------------------
export type SniffKind = 'pdf' | 'text' | 'rejected';
export interface SniffResult { kind: SniffKind; reason?: string }

const startsWith = (b: Uint8Array, magic: Array<number>): boolean =>
  magic.every((v, i) => b[i] === v);
const ascii = (s: string): Array<number> => [...s].map((c) => c.charCodeAt(0));

export function sniffKind(bytes: Uint8Array, filename: string): SniffResult {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  // Hostile magic first: executables and archives are rejected whatever the
  // extension claims (this also catches .docx, which is a zip container).
  if (startsWith(bytes, ascii('MZ')) || startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46]) ||
      startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe]) || startsWith(bytes, [0xfe, 0xed, 0xfa, 0xce])) {
    return { kind: 'rejected', reason: 'executable' };
  }
  if (startsWith(bytes, ascii('PK\x03\x04')) || startsWith(bytes, ascii('PK\x05\x06')) ||
      startsWith(bytes, ascii('PK\x07\x08')) || startsWith(bytes, ascii('Rar!\x1a\x07')) ||
      startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) || startsWith(bytes, [0x1f, 0x8b])) {
    return { kind: 'rejected', reason: ext === 'docx' ? 'docx' : 'archive' };
  }
  if (ext === 'docx' || ext === 'doc') return { kind: 'rejected', reason: 'docx' };
  const isPdfMagic = startsWith(bytes, ascii('%PDF-'));
  if (ext === 'pdf' && !isPdfMagic) return { kind: 'rejected', reason: 'not-pdf' };
  if (isPdfMagic) return { kind: 'pdf' };
  // Images and media carry no extractable text layer — reject, don't OCR.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) || startsWith(bytes, [0xff, 0xd8, 0xff]) ||
      startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a')) ||
      startsWith(bytes, ascii('RIFF')) || startsWith(bytes, ascii('BM'))) {
    return { kind: 'rejected', reason: 'unsupported' };
  }
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
    return hasBinaryBytes(bytes) ? { kind: 'rejected', reason: 'binary' } : { kind: 'text' };
  }
  // Unknown extension: accept by content when it is plainly text, else reject.
  return hasBinaryBytes(bytes) ? { kind: 'rejected', reason: 'unsupported' } : { kind: 'text' };
}

function hasBinaryBytes(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 65536);
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0) return true; // NUL never appears in honest text uploads
  }
  return false;
}

// --- PDF extraction (server-side, Workers-compatible via unpdf) --------------
export interface PdfExtract { text: string; pages: number }

export async function extractPdfText(pdfBytes: Uint8Array): Promise<PdfExtract> {
  let doc: { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>; destroy(): Promise<void> };
  try {
    const task = (pdfjs as any).getDocument({
      data: new Uint8Array(pdfBytes),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    doc = await task.promise;
  } catch (e) {
    // Log the cause server-side (sizes only, never content) for ops visibility.
    console.log(`[nanotab-publish] pdf extract failed (${pdfBytes.length}B): ${(e as Error)?.message ?? e}`);
    throw new IngestError(400, 'Could not read that PDF — paste the text instead.');
  }
  try {
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let s = '';
      for (const it of tc.items as Array<{ str?: unknown; hasEOL?: boolean }>) {
        if (typeof it?.str !== 'string') continue;
        s += it.hasEOL ? `${it.str}\n` : it.str;
      }
      if (s.trim()) out.push(s.trim());
    }
    return { text: out.join('\n\n'), pages: doc.numPages };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

// Best-effort /Title from the PDF Info dict (literal or hex string, no deps).
export function extractPdfInfoTitle(pdfBytes: Uint8Array): string | undefined {
  try {
    const raw = new TextDecoder('latin1').decode(pdfBytes.subarray(0, pdfBytes.length));
    const lit = /\/Title\s*\(((?:\\.|[^()\\])*)\)/.exec(raw);
    if (lit) {
      const t = lit[1].replace(/\\([()\\])/g, '$1').replace(/\\[rn]/g, ' ').trim();
      if (t) return t.slice(0, 200);
    }
    const hex = /\/Title\s*<([0-9a-fA-F\s]+)>/.exec(raw);
    if (hex) {
      const cleanHex = hex[1].replace(/\s+/g, '');
      if (cleanHex.length >= 2 && cleanHex.length % 2 === 0) {
        const buf = new Uint8Array(cleanHex.length / 2);
        for (let i = 0; i < buf.length; i++) buf[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
        const isUtf16 = buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff;
        const t = new TextDecoder(isUtf16 ? 'utf-16be' : 'latin1').decode(isUtf16 ? buf.subarray(2) : buf).trim();
        if (t) return t.slice(0, 200);
      }
    }
  } catch { /* metadata is a hint, never load-bearing */ }
  return undefined;
}

// Extracted PDF text → normalised markdown. Layout recovery is heuristic:
// line breaks and list markers are preserved as-is, hyphenated line wraps are
// rejoined, and the metadata title becomes the H1 when the text lacks one.
export function pdfTextToMarkdown(text: string, pdfTitle?: string): string {
  let md = normalizeMarkdown(text.replace(/([A-Za-z])-\n([a-z])/g, '$1$2'));
  if (pdfTitle && md && !md.toLowerCase().startsWith(pdfTitle.toLowerCase())) {
    md = `# ${pdfTitle}\n\n${md}`;
  }
  return md;
}

// --- upload rate limiting (per IP) -------------------------------------------
export async function checkUploadRateLimit(kv: RateKV, ip: string): Promise<void> {
  const now = new Date().toISOString();
  const hourKey = `ulh:${ip}:${now.slice(0, 13)}`;
  const minKey = `ulm:${ip}:${now.slice(0, 16)}`;
  let hourCount = 0;
  let minCount = 0;
  try {
    hourCount = Number((await kv.get(hourKey)) ?? 0);
    minCount = Number((await kv.get(minKey)) ?? 0);
  } catch { /* KV hiccup: fail open, uploads must not break on counters */ }
  if (minCount >= UPLOAD_LIMIT_PER_MINUTE) {
    throw new IngestError(429, 'Too many uploads — wait a minute and try again.');
  }
  if (hourCount >= UPLOAD_LIMIT_PER_HOUR) {
    throw new IngestError(429, 'Too many uploads — try again in a bit.');
  }
  try {
    await kv.put(minKey, String(minCount + 1), { expirationTtl: 120 });
    await kv.put(hourKey, String(hourCount + 1), { expirationTtl: 3600 });
  } catch { /* best-effort counters */ }
}

// --- rejection copy (polite, no oracle detail on hostile bytes) --------------
export function rejectionMessage(reason: string | undefined): string {
  if (reason === 'docx') return 'Word files are not supported yet — export to PDF or paste the text instead.';
  if (reason === 'not-pdf') return 'That file is named .pdf but is not a valid PDF — check the file and try again.';
  if (reason === 'binary') return 'That file is not readable text — upload a PDF, .md, or .txt file instead.';
  return 'That file type is not supported — upload a PDF, .md, or .txt file.';
}
