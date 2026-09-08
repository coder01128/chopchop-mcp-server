# ChopChop MCP Server

A Model Context Protocol (MCP) server that exposes tools from a multi-tenant Supabase commerce backend. Lets an AI agent query tenants, browse catalogue items with pricing, pull recent orders, and add products — all through the MCP tool-calling interface.

## Tools

| Tool | Description |
|------|-------------|
| `list_tenants` | Returns all active tenants on the platform |
| `get_products` | Catalogue items with variant pricing for a tenant (embedded select join) |
| `get_orders` | Recent orders with line items for a tenant |
| `add_item` | Adds a product with a default variant and price to a tenant's catalogue |

## Setup

```bash
# Install dependencies
npm install

# Copy environment template and fill in your Supabase credentials
cp .env.example .env

# Build
npm run build

# Run
npm start
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (bypasses RLS) |

## Usage with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This opens a web UI where you can call each tool interactively.

## Usage with Claude Desktop

Add to your Claude Desktop MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "chopchop": {
      "command": "node",
      "args": ["/absolute/path/to/chopchop-mcp-server/dist/index.js"]
    }
  }
}
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for data flow, project structure, and schema details.

## Design Decisions

See [DECISIONS.md](DECISIONS.md) for rationale on transport choice, auth strategy, schema validation, and more.

## Tech Stack

- **Runtime:** Node.js + TypeScript (strict mode)
- **MCP:** @modelcontextprotocol/sdk (official TypeScript SDK)
- **Database:** Supabase (PostgreSQL) via @supabase/supabase-js
- **Validation:** Zod (integrated with MCP SDK)
- **Transport:** stdio
