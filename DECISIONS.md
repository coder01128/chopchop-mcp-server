# Design Decisions

## 1. MCP SDK over Express

Used `@modelcontextprotocol/sdk` (the official TypeScript SDK) instead of building a custom HTTP server with Express. The SDK handles JSON-RPC transport, tool registration, and Zod-based schema validation out of the box. No reason to reinvent the protocol layer — the SDK is the standard that MCP clients (Claude Desktop, Cline, etc.) expect, and it keeps the codebase focused on tool logic rather than plumbing.

## 2. stdio transport

Shipped with stdio transport (the SDK default). The server runs as a subprocess — the MCP client spawns it and communicates over stdin/stdout. No HTTP server to configure, no ports, no CORS. This is the simplest deployment model and matches how most MCP servers are consumed: as a local process managed by the client.

## 3. Service-role key (bypasses RLS)

The Supabase client uses a service-role key, which bypasses row-level security. This is necessary because the server accesses data across all tenants — the AI agent picks which tenant to query. Tenant isolation is enforced at the application level: every query includes `.eq('tenant_id', tenantId)`.

**Production alternative:** Scope access by the authenticated user's tenant memberships. Issue short-lived tokens tied to specific tenants via Supabase Auth or a custom JWT, so the database enforces isolation rather than the application.

## 4. Zod schemas for tool inputs

Tool input schemas are defined with Zod, which the MCP SDK uses natively for validation. This gives type safety end to end — from the agent's tool call through validation to the handler function — with no manual parsing or type assertions. The `order_status` enum in `get_orders` makes the tool self-documenting: an agent can see the valid values without external documentation.

## 5. Two-table insert over RPC for add_item

`add_item` performs two sequential inserts: first into `items`, then into `variants` with the newly created item's ID. This is not wrapped in a database transaction.

**Why this is acceptable for a demo:** The failure mode is narrow (item created but variant missing), and the error is surfaced clearly in the response. The two-step approach demonstrates understanding of the normalised schema — prices live on variants, not items.

**Production alternative:** Wrap both inserts in a Supabase RPC function (a Postgres function) that runs them in a single transaction, rolling back if either fails.

## 6. Why ChopChop as the backend

ChopChop is a multi-tenant commerce platform with real product data, order history, and tenant isolation — the most interesting Supabase backend available. It demonstrates joins (items → variants, orders → order_items), enum-based filtering, and both read and write operations. The alternatives (single-tenant apps or sensitive financial data) wouldn't showcase the same breadth.

## 7. RLS bypass is a conscious choice

`orders` and `order_items` have RLS enabled; other tables do not. The service-role key bypasses RLS on all tables. This is documented and acceptable for a demo server that isn't exposed publicly. The application-level `.eq('tenant_id', ...)` guard on every query provides equivalent isolation for this use case.
