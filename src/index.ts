import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listTenants } from "./tools/list-tenants.js";
import { getProducts } from "./tools/get-products.js";
import { getOrders } from "./tools/get-orders.js";
import { addItem } from "./tools/add-item.js";

const server = new McpServer({
  name: "chopchop",
  version: "1.0.0",
});

server.tool(
  "list_tenants",
  "Returns all active tenants on the ChopChop platform",
  {},
  listTenants
);

server.tool(
  "get_products",
  "Returns catalogue items with variant pricing for a tenant. Uses Supabase embedded select to join items with variants.",
  {
    tenant_id: z.string().uuid().describe("Tenant UUID"),
    category_id: z
      .string()
      .uuid()
      .optional()
      .describe("Filter by category UUID"),
    limit: z
      .number()
      .int()
      .positive()
      .default(20)
      .describe("Max items to return (default 20)"),
  },
  getProducts
);

server.tool(
  "get_orders",
  "Returns recent orders with line items for a tenant. Ordered by most recent first.",
  {
    tenant_id: z.string().uuid().describe("Tenant UUID"),
    status: z
      .enum(["sent", "received", "confirmed", "ready", "completed", "cancelled"])
      .optional()
      .describe("Filter by order status"),
    limit: z
      .number()
      .int()
      .positive()
      .default(10)
      .describe("Max orders to return (default 10)"),
  },
  getOrders
);

server.tool(
  "add_item",
  "Adds a product to a tenant's catalogue. Creates both the item and a default variant with the given price.",
  {
    tenant_id: z.string().uuid().describe("Tenant UUID"),
    name: z.string().describe("Product name"),
    price: z.number().positive().describe("Price for the default variant"),
    description: z.string().optional().describe("Product description"),
    category_id: z
      .string()
      .uuid()
      .optional()
      .describe("Category UUID to assign the item to"),
  },
  addItem
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ChopChop MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
