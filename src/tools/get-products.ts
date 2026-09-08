import { supabase } from "../lib/supabase.js";

interface GetProductsArgs {
  tenant_id: string;
  category_id?: string;
  limit?: number;
}

export async function getProducts({
  tenant_id,
  category_id,
  limit = 20,
}: GetProductsArgs) {
  let query = supabase
    .from("items")
    .select(
      "id, name, description, image_url, active, category_id, variants(id, price, stock, available, sku, attributes)"
    )
    .eq("tenant_id", tenant_id)
    .eq("active", true)
    .limit(limit);

  if (category_id) {
    query = query.eq("category_id", category_id);
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
