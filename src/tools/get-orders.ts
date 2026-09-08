import { supabase } from "../lib/supabase.js";

interface GetOrdersArgs {
  tenant_id: string;
  status?: string;
  limit?: number;
}

export async function getOrders({
  tenant_id,
  status,
  limit = 10,
}: GetOrdersArgs) {
  let query = supabase
    .from("orders")
    .select(
      "id, reference, customer_name, status, total, created_at, fulfilment, order_items(name_snapshot, price_snapshot, qty, line_total)"
    )
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return {
      content: [{ type: "text" as const, text: `Error: ${error.message}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
