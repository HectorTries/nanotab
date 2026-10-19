#!/usr/bin/env node
/**
 * nanotab MCP server — hosted Streamable HTTP transport.
 *
 * Exposes the same tools as the stdio server (nanotab_pay, nanotab_price)
 * over MCP Streamable HTTP at POST /mcp (stateless: one transport per request).
 *
 * Wallet key resolution per request (first match wins):
 *   1. Authorization: Bearer <wallet-key> header
 *   2. ?walletKey=<key> query param
 *   3. NANOTAB_WALLET_KEY server env (shared default)
 *
 * The key is NEVER logged. Applied via process.env for the duration of the
 * request only, then restored — the underlying @nanotab/agent-sdk reads
 * NANOTAB_WALLET_KEY from the environment.
 *
 * NOTE: concurrent requests with *different* per-request keys share one
 * process env, so cross-contamination between in-flight requests is possible
 * under load. Deployments where each client brings its own key should run
 * one process per tenant, or (recommended, e.g. Smithery) bake a single
 * NANOTAB_WALLET_KEY into the server env.
 */
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { z } from 'zod';
import { nanotabFetch } from '@nanotab/agent-sdk';

const PORT = Number(process.env.PORT ?? 4024);
const VERSION = '0.1.1';

function buildServer(): McpServer {
  const server = new McpServer({ name: 'nanotab', version: VERSION });

  server.tool(
    'nanotab_pay',
    'Fetch a URL, paying any HTTP 402 price (USDC on Base) up to maxAmount USD. Returns the paid content.',
    { url: z.string().url(), maxAmount: z.number().positive().default(0.1) },
    async ({ url, maxAmount }) => {
      try {
        const data = await nanotabFetch(url, { price: maxAmount });
        const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `nanotab_pay error: ${err?.message ?? err}` }], isError: true };
      }
    }
  );

  server.tool(
    'nanotab_price',
    'Check the price of a URL without paying. Returns the 402 payment spec (amount, payTo, asset) or "free".',
    { url: z.string().url() },
    async ({ url }) => {
      try {
        const res = await fetch(url);
        if (res.status !== 402) {
          return { content: [{ type: 'text' as const, text: `free (HTTP ${res.status})` }] };
        }
        const spec = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(spec, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `nanotab_price error: ${err?.message ?? err}` }], isError: true };
      }
    }
  );

  return server;
}

/** Extract per-request wallet key from header or query. Never logged. */
function requestWalletKey(req: express.Request): string | undefined {
  const auth = req.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const k = auth.slice(7).trim();
    if (k) return k;
  }
  const xwk = req.get('x-wallet-key');
  if (xwk?.trim()) return xwk.trim();
  const q = req.query.walletKey;
  if (typeof q === 'string' && q) return q;
  return undefined;
}

const app = createMcpExpressApp({
  host: '0.0.0.0',
  allowedHosts: ['mcp.nanotab.dev', 'nanotab.dev', 'www.nanotab.dev', '127.0.0.1', 'localhost'],
});
// NOTE: createMcpExpressApp already installs a JSON body parser — do NOT add another.

app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'nanotab-mcp', version: VERSION }));

// Static metadata for registry scanners (e.g. Smithery).
app.get('/.well-known/mcp/server-card.json', (_req, res) => {
  res.json({
    name: 'nanotab',
    version: VERSION,
    description: 'NanoTab MCP server — pay-per-fetch web content via USDC on Base (x402)',
    transport: 'streamable-http',
    endpoint: 'https://mcp.nanotab.dev/mcp',
    tools: ['nanotab_pay', 'nanotab_price'],
    auth: 'per-request wallet key via Authorization: Bearer <key> (optional; server default applies otherwise)',
    homepage: 'https://nanotab.dev',
    repository: 'https://github.com/HectorTries/nanotab',
  });
});

async function handleMcp(req: any, res: any) {
  const server = buildServer();
  const prev = process.env.NANOTAB_WALLET_KEY;
  const override = requestWalletKey(req);
  if (override) process.env.NANOTAB_WALLET_KEY = override;
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error('Error handling MCP request:', error instanceof Error ? error.message : 'unknown');
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  } finally {
    if (override) {
      if (prev === undefined) delete process.env.NANOTAB_WALLET_KEY;
      else process.env.NANOTAB_WALLET_KEY = prev;
    }
  }
}
app.post('/mcp', handleMcp);
app.post('/', handleMcp);

// SSE GET / DELETE are not used in stateless mode — 405 per MCP spec guidance.
app.get('/mcp', (_req, res) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Use POST /mcp.' }, id: null });
});
app.delete('/mcp', (_req, res) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`nanotab MCP Streamable HTTP listening on 127.0.0.1:${PORT}`);
});
