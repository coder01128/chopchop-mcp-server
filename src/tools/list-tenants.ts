import { supabase } from "../lib/supabase.js";

export async function listTenants() {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug, active, listed")
    .eq("active", true);

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
