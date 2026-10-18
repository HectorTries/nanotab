#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { nanotabFetch } from '@nanotab/agent-sdk';

const server = new McpServer({ name: 'nanotab', version: '0.1.0' });

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
