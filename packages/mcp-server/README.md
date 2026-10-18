# @nanotab/mcp-server

NanoTab MCP server — pay-per-fetch web content via USDC on Base (x402-style HTTP 402).

## Tools

- `nanotab_pay(url, maxAmount)` — fetch a URL, paying any 402 price up to `maxAmount` USD. Returns content.
- `nanotab_price(url)` — return the 402 payment spec without paying (or `free`).

## Setup

```json
{
  "mcpServers": {
    "nanotab": {
      "command": "npx",
      "args": ["-y", "@nanotab/mcp-server"],
      "env": { "NANOTAB_WALLET_KEY": "0x..." }
    }
  }
}
```

Requires `NANOTAB_WALLET_KEY` for real Base-mainnet USDC signing.
