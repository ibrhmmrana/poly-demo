"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import RealtimeBadge from "./RealtimeBadge";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Props {
  tables: string[];
  children: React.ReactNode;
}

export default function RealtimeRefresher({ tables, children }: Props) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    const channels: RealtimeChannel[] = [];

    for (const table of tables) {
      const channel = sb
        .channel(`rt-${table}-${Math.random().toString(36).slice(2, 6)}`)
        .on(
          "postgres_changes" as "system",
          { event: "*", schema: "public", table } as Record<string, unknown>,
          () => {
            clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => router.refresh(), 500);
          }
        )
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") setConnected(true);
        });
      channels.push(channel);
    }

    return () => {
      channels.forEach((c) => sb.removeChannel(c));
    };
  }, [tables.join(","), router]);

  return (
    <div>
      <div className="flex justify-end mb-3">
        <RealtimeBadge connected={connected} />
      </div>
      {children}
    </div>
  );
}
