// Ingest tests: `node test/ingest.test.mjs` (npm run test:ingest). Fully offline —
// drives the publish worker's POST /v1/ingest route plus the pure helpers in
// src/ingest.ts. Uploading a file converts it to markdown server-side; the
// original bytes are never persisted (markdown-only storage model).
import worker from '../src/index.ts';
import {
  MAX_EXTRACTED_CHARS,
  MAX_UPLOAD_BYTES,
  NO_TEXT_MESSAGE,
  countWords,
  deriveTitle,
  normalizeMarkdown,
  sanitizeMarkdown,
  sniffKind,
} from '../src/ingest.ts';

const WALLET = '0xb157000000000000000000000000000000000001';

const mkKV = () => {
  const store = new Map();
  return {
    store,
    get: async (k, type) => {
      if (!store.has(k)) return null;
      const v = store.get(k);
      return type === 'json' ? JSON.parse(v) : v;
    },
    put: async (k, v) => { store.set(k, v); },
    delete: async (k) => { store.delete(k); },
    list: async ({ prefix = '' } = {}) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
  };
};
const mkR2 = () => {
  const store = new Map();
  return {
    store,
    put: async (k, v) => { store.set(k, v); },
    get: async (k) => (store.has(k) ? { body: store.get(k), size: store.get(k).length } : null),
  };
};
const kv = mkKV();
const r2 = mkR2();
const env = { NANOTAB_FEE_BPS: '200', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: r2 };

let fail = 0;
let ipN = 1;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) fail++; };
// Fresh fake client IP per call unless the test pins one (rate-limit buckets are per IP).
const ingestReq = (file, name, ip = `10.9.0.${ipN++}`) => {
  const fd = new FormData();
  fd.set('file', file, name);
  return new Request('https://pay.nanotab.dev/v1/ingest', {
    method: 'POST',
    headers: { 'cf-connecting-ip': ip },
    body: fd,
  });
};

// Minimal hand-built one-page PDFs (valid enough for the real extractor).
const pdfDoc = (contentStream) =>
  `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length ${contentStream.length}>>stream\n${contentStream}endstream\nendobj\ntrailer<</Root 1 0 R>>`;
const TEXT_PDF = pdfDoc('BT /F1 12 Tf 10 180 Td (Hello NanoTab PDF) Tj ET\n');
const EMPTY_PDF = pdfDoc('');
const pdfFile = (s) => new File([Buffer.from(s, 'latin1')], 'doc.pdf', { type: 'application/pdf' });

// --- pure helpers ---
{
  check('limits: 10MB upload, 200k extracted chars',
    MAX_UPLOAD_BYTES === 10 * 1024 * 1024 && MAX_EXTRACTED_CHARS === 200000);
  check('normalize: CRLF, trailing space, blank-run collapse',
    normalizeMarkdown('a  \r\nb\r\n\r\n\r\n\r\nc   ') === 'a\nb\n\n\nc\n');
  check('normalize: strips NUL/control, keeps tab',
    normalizeMarkdown('a\x00b\x07c\td') === 'abc\td\n');
  check('sanitize: benign markdown is byte-identical',
    sanitizeMarkdown('# hello\npaid content') === '# hello\npaid content');
  const nasty = '<script>alert(1)</script>Hi <b onload="x()">there</b> [x](javascript:alert(1)) <iframe src="https://evil.example"></iframe>';
  const clean = sanitizeMarkdown(nasty);
  check('sanitize: strips script/iframe, on* attrs, javascript: URLs',
    !/script/i.test(clean) && !/onload/i.test(clean) && !/javascript:/i.test(clean) &&
    !/iframe/i.test(clean) && clean.includes('Hi') && clean.includes('there') && clean.includes('[x]'));
  check('sanitize: idempotent', sanitizeMarkdown(clean) === clean);
  check('title: first heading wins', deriveTitle('# My Title\nbody') === 'My Title');
  check('title: pdf metadata beats filename',
    deriveTitle('no heading here', { filename: 'f.md', pdfTitle: 'Meta Title' }) === 'Meta Title');
  check('title: filename fallback strips extension',
    deriveTitle('no heading here', { filename: 'my-doc.md' }) === 'my-doc');
  check('title: empty falls back', deriveTitle('   \n ') === 'Untitled document');
  check('title: truncates to 200 chars', deriveTitle(`# ${'x'.repeat(300)}`).length === 200);
  check('words: counts', countWords('one two  three\nfour') === 4 && countWords('') === 0);
  check('sniff: pdf magic', sniffKind(new Uint8Array(Buffer.from('%PDF-1.4...')), 'a.pdf').kind === 'pdf');
  check('sniff: text', sniffKind(new Uint8Array(Buffer.from('# hi\nplain text')), 'a.md').kind === 'text');
  check('sniff: exe rejected', sniffKind(new Uint8Array(Buffer.from('MZ\x90\x00evil')), 'a.md').kind === 'rejected');
  check('sniff: zip/docx rejected', sniffKind(new Uint8Array(Buffer.from('PK\x03\x04zip!')), 'a.docx').kind === 'rejected');
  check('sniff: .pdf without magic rejected', sniffKind(new Uint8Array(Buffer.from('not a pdf')), 'a.pdf').kind === 'rejected');
}

// --- POST /v1/ingest: happy paths ---
{
  const before = kv.store.size + r2.store.size;
  let r = await worker.fetch(ingestReq(new File(['# Doc Title\n\nSome body text here.'], 'd.md', { type: 'text/markdown' }), 'd.md'), env, {});
  let j = await r.json().catch(() => ({}));
  check('ingest: .md → 200 markdown + derived title + counts',
    r.status === 200 && j.markdown === '# Doc Title\n\nSome body text here.\n' && j.title === 'Doc Title' &&
    j.chars === j.markdown.length && j.words === 6, `status=${r.status} ${JSON.stringify(j).slice(0, 120)}`);
  r = await worker.fetch(ingestReq(new File(['plain words here'], 'notes.txt', { type: 'text/plain' }), 'notes.txt'), env, {});
  j = await r.json().catch(() => ({}));
  check('ingest: .txt → 200 treated as markdown',
    r.status === 200 && j.markdown === 'plain words here\n' && j.title === 'notes', `status=${r.status}`);
  r = await worker.fetch(ingestReq(pdfFile(TEXT_PDF), 'doc.pdf'), env, {});
  j = await r.json().catch(() => ({}));
  check('ingest: real PDF text extraction → markdown',
    r.status === 200 && typeof j.markdown === 'string' && j.markdown.includes('Hello NanoTab PDF') && j.pages === 1,
    `status=${r.status} ${JSON.stringify(j).slice(0, 120)}`);
  check('ingest: original bytes never persisted (markdown-only)',
    r2.store.size === 0 && ![...kv.store.keys()].some((k) => k.startsWith('rb:') || k.startsWith('r:') || k.startsWith('listing:')));
}

// --- POST /v1/ingest: hostile / over-limit inputs ---
{
  let r = await worker.fetch(ingestReq(pdfFile(EMPTY_PDF), 'scan.pdf'), env, {});
  let j = await r.json().catch(() => ({}));
  check('ingest: scanned PDF → 400 with exact no-text message',
    r.status === 400 && j.error === NO_TEXT_MESSAGE &&
    NO_TEXT_MESSAGE === 'This PDF has no selectable text — paste the text instead.',
    `status=${r.status} ${JSON.stringify(j).slice(0, 100)}`);
  r = await worker.fetch(ingestReq(new File([Buffer.from('MZ\x90\x00evil-code-here')], 'x.md'), 'x.md'), env, {});
  j = await r.json().catch(() => ({}));
  check('ingest: executable bytes → 400', r.status === 400 && typeof j.error === 'string', `status=${r.status}`);
  r = await worker.fetch(ingestReq(new File([Buffer.from('PK\x03\x04zip-bytes-here........')], 'x.docx'), 'x.docx'), env, {});
  j = await r.json().catch(() => ({}));
  check('ingest: docx/archive → 400', r.status === 400 && typeof j.error === 'string', `status=${r.status}`);
  r = await worker.fetch(ingestReq(new File([Buffer.alloc(10 * 1024 * 1024 + 1, 97)], 'big.md'), 'big.md'), env, {});
  j = await r.json().catch(() => ({}));
  check('ingest: >10MB → 400', r.status === 400 && typeof j.error === 'string', `status=${r.status}`);
  r = await worker.fetch(ingestReq(new File(['z'.repeat(200001)], 'long.md'), 'long.md'), env, {});
  j = await r.json().catch(() => ({}));
  check('ingest: >200k extracted chars → 400 polite refusal',
    r.status === 400 && typeof j.error === 'string' && j.error.includes('200,000'), `status=${r.status}`);
  const fd = new FormData();
  fd.set('note', 'no file field');
  r = await worker.fetch(new Request('https://pay.nanotab.dev/v1/ingest', { method: 'POST', headers: { 'cf-connecting-ip': `10.9.0.${ipN++}` }, body: fd }), env, {});
  check('ingest: missing file → 400', r.status === 400);
  r = await worker.fetch(new Request('https://pay.nanotab.dev/v1/ingest', { headers: { 'cf-connecting-ip': `10.9.0.${ipN++}` } }), env, {});
  check('ingest: GET → 404 (POST only)', r.status === 404);
}

// --- POST /v1/ingest: per-IP rate limits (3/min, 10/hour) ---
{
  const ip = '10.8.8.8';
  const tiny = () => ingestReq(new File(['hi'], 'h.md'), 'h.md', ip);
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await worker.fetch(tiny(), env, {})).status);
  check('ingest: 3/min per IP (4th → 429)',
    codes[0] === 200 && codes[1] === 200 && codes[2] === 200 && codes[3] === 429, `codes=${codes.join(',')}`);
}

// --- publish hardening: markdown canonical record ---
{
  const post = (body) => new Request('https://pay.nanotab.dev/v1/publish', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const good = (body_b64, mime = 'text/markdown') => ({
    title: 'ingest check', mime, price_cents: 5, merchant_wallet: WALLET, body_b64,
  });
  let r = await worker.fetch(post(good(Buffer.from('s'.repeat(200001)).toString('base64'))), env, {});
  check('publish: markdown >200k chars → 400', r.status === 400);
  r = await worker.fetch(post(good(Buffer.from('# ok\n<script>alert(1)</script>').toString('base64'))), env, {});
  const j = await r.json().catch(() => ({}));
  const stored = j.slug ? Buffer.from(r2.store.get(`r/${j.slug}`)).toString() : '';
  check('publish: markdown sanitized at rest (no script)',
    r.status === 201 && !stored.includes('<script') && stored.includes('# ok'), `status=${r.status}`);
}

// --- ingest UI: /publish is the document-first path, / wizard matches ---
{
  const get = (path) => worker.fetch(new Request(`https://pay.nanotab.dev${path}`), env, {});
  let r = await get('/publish');
  let html = await r.text();
  check('page: /publish → 200 ingest-first flow',
    r.status === 200 && html.includes('Publish your document') && html.includes('id="f-drop"') &&
    html.includes('id="f-file"') && html.includes('/v1/ingest') && html.includes('<form') &&
    html.includes('textarea') && html.includes('/v1/publish') && html.includes('curl'));
  check('page: /publish → paste + preview + counts + title + free preview',
    html.includes('id="f-body"') && html.includes('id="f-preview"') && html.includes('id="f-counts"') &&
    html.includes('id="f-title"') && html.includes('Free preview') && html.includes('id="f-abstract"'));
  check('page: /publish → demoted URL, price presets, wallet, result panel',
    html.includes('Advanced — I already host this') && html.includes('Gating only covers the copy served through NanoTab') &&
    html.includes('data-price="0.05"') && html.includes('Generate instant wallet') && html.includes('id="p-pk" type="password"') &&
    html.includes('Agent paywall link (HTTP 402)') && html.includes('Copy test curl') && html.includes('Human page (free preview)'));
  check('page: /publish → sandboxed (scripts + modals only)',
    (r.headers.get('content-security-policy') || '').includes('sandbox'));
  r = await get('/');
  html = await r.text();
  check('page: / → content-first wizard with dropzone + preview + demoted URL',
    r.status === 200 && html.includes('id="p-drop"') && html.includes('id="p-preview"') &&
    html.includes('id="p-counts"') && html.includes('/v1/ingest') &&
    html.includes('Advanced — I already host this') && html.includes('Human page (free preview)') &&
    html.includes('id="p-link"') && html.includes('id="p-body"') && html.includes('id="p-file"'));
  r = await get('/privacy');
  html = await r.text();
  check('page: /privacy → markdown-only storage stated honestly',
    r.status === 200 && html.includes('discarded immediately after successful extraction') &&
    html.includes('never stored and never served') && html.includes('never used for training'));
  r = await get('/developers');
  html = await r.text();
  check('page: /developers → documents POST /v1/ingest',
    r.status === 200 && html.includes('/v1/ingest') && html.includes('nanotab protect'));
}

process.exit(fail ? 1 : 0);
