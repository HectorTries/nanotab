#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { nanotabFetch } from '@nanotab/agent-sdk';

const server = new McpServer({ name: 'nanotab', version: '0.1.0' });

const MARKETPLACE_URL =
  process.env.NANOTAB_MARKETPLACE_URL ?? 'https://nanotab-publish.growingmoneytrees.workers.dev/v1/marketplace.json';

server.tool(
  'nanotab_search',
  'Search NanoTab hosted paywalled listings (title scan over marketplace.json). Returns matching listings with URL, price, mime.',
  { query: z.string().min(1).describe('Keyword to match against listing titles') },
  async ({ query }) => {
    try {
      const res = await fetch(MARKETPLACE_URL);
      if (!res.ok) throw new Error(`marketplace HTTP ${res.status}`);
      const items = (await res.json()) as Array<{ url: string; title: string; price_usd: string; mime: string; merchant: string }>;
      const q = query.toLowerCase();
      const hits = items.filter((i) => i.title?.toLowerCase().includes(q)).slice(0, 20);
      const text = hits.length
        ? hits.map((h) => `${h.title} — $${h.price_usd} — ${h.url} (${h.mime})`).join('\n')
        : `no listings match "${query}" (${items.length} total)`;
      return { content: [{ type: 'text' as const, text }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `nanotab_search error: ${err?.message ?? err}` }], isError: true };
    }
  }
);

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

const transport = new StdioServerTransport();
await server.connect(transport);
