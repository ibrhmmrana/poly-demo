import SettingsForm from "@/components/SettingsForm";
import { createServerSupabase } from "@/lib/supabase-server";

export const revalidate = 0;

export default async function SettingsPage() {
  const sb = createServerSupabase();
  const { data } = await sb.from("bot_settings").select("key, value");
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: { key: string; value: string }) => {
    map[r.key] = r.value;
  });

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Settings</h2>
      <SettingsForm initialSettings={map} />
    </div>
  );
}
