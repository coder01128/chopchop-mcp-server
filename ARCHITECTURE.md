# Architecture

## Overview

ChopChop MCP Server is a Model Context Protocol server that exposes four tools from a multi-tenant Supabase commerce backend. An AI agent connects via stdio and can query tenants, browse catalogues with pricing, pull orders with line items, and add products — all scoped by tenant.

## Data Flow

```
AI Agent (Claude Desktop / Cline / MCP Inspector)
    ↕ JSON-RPC over stdio
MCP Server (Node.js + @modelcontextprotocol/sdk)
    ↕ Supabase JS client (service-role key)
ChopChop Supabase (PostgreSQL)
```

## Project Structure

```
src/
├── index.ts              Server init, tool registration, stdio transport
├── lib/
│   └── supabase.ts       Supabase client (reads SUPABASE_URL and key from env)
└── tools/
    ├── list-tenants.ts    Returns active tenants
    ├── get-products.ts    Items + variants (embedded select join)
    ├── get-orders.ts      Orders + order_items (embedded select join)
    └── add-item.ts        Two-table insert: item then variant
```

## Tools

| Tool | Params | Tables | Operation |
|------|--------|--------|-----------|
| `list_tenants` | none | tenants | Read |
| `get_products` | tenant_id, category_id?, limit? | items → variants | Read (join) |
| `get_orders` | tenant_id, status?, limit? | orders → order_items | Read (join) |
| `add_item` | tenant_id, name, price, description?, category_id? | items, variants | Write (sequential insert) |

## Tenant Isolation

Every tool that touches tenant-scoped data includes `.eq('tenant_id', tenantId)` in the query. The Supabase client uses a service-role key (bypasses RLS), so isolation is enforced at the application level. See DECISIONS.md for the production alternative.

## Key Schema Details

- **Prices live on `variants`, not `items`.** An item can have multiple variants (sizes, etc.), each with its own price and stock.
- **Orders use `reference` as the order identifier**, not `order_number`.
- **`order_status` enum:** sent → received → confirmed → ready → completed → cancelled.
