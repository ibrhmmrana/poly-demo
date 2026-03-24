import { createServerSupabase } from "./supabase-server";

export async function getBotSettings(): Promise<Record<string, string>> {
  const sb = createServerSupabase();
  const { data } = await sb.from("bot_settings").select("key, value");
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: { key: string; value: string }) => {
    map[r.key] = r.value;
  });
  return map;
}
