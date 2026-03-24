import SettingsForm from "@/components/SettingsForm";
import { getBotSettings } from "@/lib/queries";

export const revalidate = 0; // always fresh

export default async function SettingsPage() {
  const settings = await getBotSettings();

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Bot Settings</h2>
      <SettingsForm initialSettings={settings} />
    </div>
  );
}
