"use server";

import { createClient } from "@supabase/supabase-js";

export async function updateBotSetting(key: string, value: string) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await sb
    .from("bot_settings")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  if (error) throw new Error(error.message);
  return { ok: true };
}
