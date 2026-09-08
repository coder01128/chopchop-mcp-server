# Handoff — ChopChop MCP Server (Schema-Verified)

## What This Is

A Model Context Protocol (MCP) server written in Node.js/TypeScript that exposes 4 tools from the ChopChop Supabase backend. An AI agent connecting to this server can query tenants, browse catalogue items with pricing, pull recent orders with line items, and add a product to a catalogue — all through the MCP tool-calling interface, all respecting tenant isolation.

Built as portfolio piece #2 for the **Blacksmith Agency AI Engineer** application.

## Why This Project Exists

The agency content pipeline (piece #1) is Python. The Blacksmith job ad lists both **Python** and **Node.js**, plus **MCP server integrations** as a specific line item under "What You'll Build." This project closes both gaps in a single repo:

| Gap | How this closes it |
|---|---|
| Node.js / TypeScript | Entire project is TS, runs on Node |
| MCP server integrations | IS an MCP server — the exact deliverable they described |
| REST APIs | Supabase client calls under the hood |
| Internal tools reducing manual hours | Gives an AI agent direct access to platform data instead of manual lookups |

After this ships, the application covers: Python ✓, Node.js ✓, LangGraph ✓, Anthropic API ✓, MCP ✓, WordPress ✓, n8n ✓, REST APIs ✓.

## Why ChopChop

ChopChop is the most interesting Supabase backend Brad has — multi-tenant commerce with row-level security, real product data, order records. An MCP server wrapping it demonstrates:

- Tenant-scoped queries (every tool call requires a tenant identifier, enforced at the DB level)
- Read and write operations (not just a read-only wrapper)
- Multi-table joins (items + variants for pricing, orders + order_items for line details)
- A realistic use case: an AI assistant managing a store's catalogue and checking its orders

The alternative backends (FashionKiller Intake, bank statement pipeline) are either single-tenant or deal with sensitive financial data that shouldn't be exposed via a demo server.

---

## Verified Database Schema

Source: Supabase dashboard screenshots, September 2026. Every column, type, and constraint below is confirmed from the live schema.

### `tenants` — 12 columns
The "store" entity. One row per client business.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| slug | text | URL-friendly identifier |
| name | text | Display name |
| whatsapp_number | text | |
| branding | jsonb | |
| attribute_schema | jsonb | Custom product attributes per tenant |
| sale_mode | sale_mode (enum) | |
| stock_mode | stock_mode (enum) | |
| fulfilment_mode | fulfilment_mode (enum) | Column name truncated in UI — verify exact name if needed |
| active | bool | |
| created_at | timestamptz | |
| listed | bool | Whether tenant appears publicly |

### `categories` — 5 columns
Product categories, scoped per tenant.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, NOT NULL |
| tenant_id | uuid | FK → tenants, NOT NULL |
| name | text | NOT NULL |
| sort_order | int4 | NOT NULL |
| active | bool | NOT NULL |

### `items` — 10 columns
The "product" entity. Has NO price column — pricing lives on `variants`.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK → tenants |
| category_id | uuid | FK → categories |
| name | text | |
| description | text | Nullable |
| image_url | text | Public URL |
| active | bool | |
| sort_order | int4 | |
| created_at | timestamptz | |
| image_path | text | Storage bucket reference |

### `variants` — 10 columns
Pricing and stock. One item can have multiple variants (e.g. sizes). Linked via `item_id`.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK → tenants |
| item_id | uuid | FK → items |
| attributes | jsonb | e.g. {"size": "large"} |
| price | numeric | **This is where the price lives** |
| stock | numeric | |
| available | bool | |
| sku | text | |
| retired_at | timestamptz | Soft-delete for variants |
| image_path | text | |

### `orders` — 14 columns
RLS **enabled** on this table.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK → tenants |
| reference | text | The order identifier (NOT "order_number") |
| customer_name | text | |
| customer_phone | text | |
| fulfilment | fulfilment_mode (enum) | |
| notes | text | |
| status | order_status (enum) | See enum values below |
| total | numeric | |
| created_at | timestamptz | |
| confirmed_at | timestamptz | |
| completed_at | timestamptz | |
| buyer_id | uuid | |
| delivery_address | text | |

### `order_items` — 9 columns
Line items for an order. RLS **enabled** on this table.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK → tenants |
| order_id | uuid | FK → orders |
| variant_id | uuid | FK → variants |
| name_snapshot | text | Product name at time of order |
| price_snapshot | numeric | Price at time of order |
| qty | numeric | |
| qty_confirmed | numeric | |
| line_total | numeric | |

### Enum: `order_status`
Verified via `SELECT unnest(enum_range(NULL::order_status))`:

```
sent → received → confirmed → ready → completed → cancelled
```

### Tables NOT used by the MCP tools
- `tenant_users` (5 cols) — auth/role mapping, not relevant
- `import_batches` (6 cols) — bulk import tracking, not relevant
- `security_definer_functions` — system view, not a table

### RLS Status
- `orders` and `order_items`: RLS **enabled**
- All other tables: RLS **disabled**
- The service-role key bypasses RLS, so this doesn't affect the MCP server. Note this in DECISIONS.md as a conscious choice.

---

## Tools to Expose

Four tools. Each takes a `tenant_id` parameter (uuid) that maps to ChopChop's tenant isolation. Use `tenant_id` consistently — the database column is `tenant_id` everywhere, not `store_id`.

### 1. `list_tenants`
- **What:** Returns all active tenants on the platform
- **Params:** none
- **Returns:** Array of `{ id, name, slug, active, listed }`
- **Query:** `supabase.from('tenants').select('id, name, slug, active, listed').eq('active', true)`
- **Why:** Entry point — lets the agent discover which tenants exist before drilling in

### 2. `get_products`
- **What:** Returns catalogue items with their variant pricing for a given tenant
- **Params:** `tenant_id` (required, uuid), `category_id` (optional, uuid — filter by category), `limit` (optional, number, default 20)
- **Returns:** Array of items, each with nested `variants` array containing price, stock, available, sku, attributes
- **Query:** Join `items` with `variants` via Supabase's embedded select:
  ```typescript
  supabase
    .from('items')
    .select('id, name, description, image_url, active, category_id, variants(id, price, stock, available, sku, attributes)')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .limit(limit)
  // Add .eq('category_id', categoryId) if the optional param is provided
  ```
- **Why:** Core read operation. The join demonstrates that the server understands the data model, not just wrapping single tables.

### 3. `get_orders`
- **What:** Returns recent orders with line items for a tenant
- **Params:** `tenant_id` (required, uuid), `status` (optional, enum: `sent | received | confirmed | ready | completed | cancelled`), `limit` (optional, number, default 10)
- **Returns:** Array of orders, each with nested `order_items` array containing name_snapshot, price_snapshot, qty, line_total
- **Query:** Join `orders` with `order_items` via Supabase's embedded select:
  ```typescript
  supabase
    .from('orders')
    .select('id, reference, customer_name, status, total, created_at, fulfilment, order_items(name_snapshot, price_snapshot, qty, line_total)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  // Add .eq('status', status) if the optional param is provided
  ```
- **Why:** Second read path, different tables, includes a join. The status enum in the Zod schema makes the tool self-documenting for the agent.

### 4. `add_item`
- **What:** Adds a product (item + default variant with price) to a tenant's catalogue
- **Params:** `tenant_id` (required, uuid), `name` (required, string), `price` (required, number), `description` (optional, string), `category_id` (optional, uuid)
- **Returns:** The created item record with its variant
- **Implementation:** Two sequential inserts:
  ```typescript
  // 1. Insert item
  const { data: item, error: itemError } = await supabase
    .from('items')
    .insert({
      tenant_id: tenantId,
      name,
      description: description ?? null,
      category_id: categoryId ?? null,
      active: true,
    })
    .select()
    .single();

  // 2. Insert default variant with the price
  const { data: variant, error: variantError } = await supabase
    .from('variants')
    .insert({
      tenant_id: tenantId,
      item_id: item.id,
      price,
      available: true,
    })
    .select()
    .single();

  // Return combined result
  return { ...item, variants: [variant] };
  ```
- **Error handling:** If the variant insert fails after the item insert succeeds, return the item with an error note about the variant. For a demo this is acceptable — note in DECISIONS.md that production would use a DB transaction or RPC function.
- **Why:** Write operation proving the server isn't read-only. The two-table insert is more impressive than a single insert — it shows the developer understands the normalised schema.

---

## SAFETY: Test Tenant for Write Operations

The butchery and shoe store tenants contain live demo data that is linked from job applications. **Do not insert, update, or delete any records in those tenants.**

A dedicated test tenant exists for all write-operation testing:

- **slug:** `mcp-test-store`
- **name:** MCP Test Store
- **listed:** false (hidden from public storefront)

All `add_item` testing and any other write operations must target this tenant only. Read operations (`list_tenants`, `get_products`, `get_orders`) can query any tenant — the real data makes the demo more impressive.

---

## Technical Decisions

### MCP SDK, not Express
Use `@modelcontextprotocol/sdk` (the official TypeScript SDK). It handles the JSON-RPC transport, tool registration, and schema validation. No reason to hand-roll with Express — the SDK is the standard, Blacksmith will recognise it, and it keeps code focused on tools rather than plumbing.

### Transport: stdio
Ship with stdio transport (the default). The server runs as a subprocess — Claude Desktop, Cline, or any MCP client spawns it and communicates over stdin/stdout. No HTTP server to configure, no ports, no CORS. Simplest deployment model.

### Supabase client with service-role key
Use `@supabase/supabase-js` with a service-role key. This key bypasses RLS, which the server needs since it accesses all tenants (the agent picks which one to query). Every query adds `.eq('tenant_id', tenantId)` as an application-level guard. Document in DECISIONS.md that production would use scoped auth tokens.

### TypeScript strict mode
`tsconfig.json` with `strict: true`. Tool input schemas defined as Zod schemas (the MCP SDK uses Zod for validation). Type safety end to end.

### Environment
- `.env` for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `dotenv` to load
- `.env.example` in the repo with placeholder values

---

## Repo Structure

```
chopchop-mcp-server/
├── src/
│   ├── index.ts          # server setup, tool registration
│   ├── tools/
│   │   ├── list-tenants.ts
│   │   ├── get-products.ts
│   │   ├── get-orders.ts
│   │   └── add-item.ts
│   └── lib/
│       └── supabase.ts   # client init
├── tsconfig.json
├── package.json
├── .env.example
├── README.md
├── ARCHITECTURE.md
└── DECISIONS.md
```

---

## What Done Looks Like

1. `npm run build` compiles clean with zero TypeScript errors
2. Server starts via `node dist/index.js` and registers 4 tools
3. Each tool can be called via the MCP Inspector CLI (`npx @modelcontextprotocol/inspector`)
4. `list_tenants` returns real tenant data from ChopChop's Supabase (at least 2 tenants visible)
5. `get_products` scoped to a tenant returns that tenant's items with variant pricing — Supabase embedded select, not manual join
6. `get_orders` scoped to a tenant returns that tenant's orders with line items
7. `get_orders` with a `status` filter returns only matching orders
8. `add_item` inserts into both `items` and `variants`, returns the combined record
9. Calling `get_products` with a non-existent `tenant_id` returns an empty array, not an error
10. README documents setup, usage, and architecture
11. DECISIONS.md documents at least 4 design choices (why stdio, why service-role key, why Zod, why ChopChop, why two-table insert over RPC)
12. Clean git history, conventional commits

---

## What This Does NOT Need to Be

- **Production-grade auth.** The service-role key is fine for a demo. In production you'd scope by the authenticated user's tenants — document this in DECISIONS.md.
- **Comprehensive CRUD.** Four tools is enough. Update and delete are the same pattern — the point is proved.
- **Deployed anywhere.** It runs locally. The Loom demo shows it working via MCP Inspector.
- **Transactional writes.** The two-step insert (item then variant) is fine for a demo. Production would use a Supabase RPC function wrapping both in a transaction.

---

## Estimated Time

Half a day. The MCP SDK does the heavy lifting — what's left is four Supabase queries in TypeScript, Zod schemas with the verified enum, error handling, and docs.

---

## Where It Fits in the Application

Brad's application message links three things:

1. **Agency Content Pipeline** (Python, LangGraph, Anthropic API, WordPress) — `github.com/coder01128/agency-content-pipeline`
2. **ChopChop MCP Server** (Node.js/TypeScript, MCP, Supabase) — `github.com/coder01128/chopchop-mcp-server`
3. **One existing shipped project** (BarcodeAuto or the bank statement pipeline) — proves the tools aren't just portfolio pieces, they're in daily use

The Loom demo walks through the pipeline first (the bigger piece), shows the MCP server briefly via Inspector, then shows a live tool in production. Under 4 minutes total.
