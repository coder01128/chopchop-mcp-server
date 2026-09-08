import { supabase } from "../lib/supabase.js";

interface AddItemArgs {
  tenant_id: string;
  name: string;
  price: number;
  description?: string;
  category_id?: string;
}

export async function addItem({
  tenant_id,
  name,
  price,
  description,
  category_id,
}: AddItemArgs) {
  const { data: item, error: itemError } = await supabase
    .from("items")
    .insert({
      tenant_id,
      name,
      description: description ?? null,
      category_id: category_id ?? null,
      active: true,
    })
    .select()
    .single();

  if (itemError) {
    return {
      content: [
        { type: "text" as const, text: `Error inserting item: ${itemError.message}` },
      ],
      isError: true,
    };
  }

  const { data: variant, error: variantError } = await supabase
    .from("variants")
    .insert({
      tenant_id,
      item_id: item.id,
      price,
      available: true,
    })
    .select()
    .single();

  if (variantError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              item,
              variant_error: `Item created but variant insert failed: ${variantError.message}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ...item, variants: [variant] }, null, 2),
      },
    ],
  };
}
