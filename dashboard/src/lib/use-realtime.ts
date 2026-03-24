"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSupabaseBrowser } from "./supabase-client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type EventType = "INSERT" | "UPDATE" | "DELETE" | "*";

interface UseRealtimeOptions {
  table: string;
  event?: EventType;
  onPayload?: (payload: Record<string, unknown>) => void;
}

export function useRealtime({ table, event = "*", onPayload }: UseRealtimeOptions) {
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onPayload);
  callbackRef.current = onPayload;

  useEffect(() => {
    const sb = getSupabaseBrowser();
    const channel = sb
      .channel(`dashboard-${table}`)
      .on(
        "postgres_changes" as "system",
        { event, schema: "public", table } as Record<string, unknown>,
        (payload: Record<string, unknown>) => {
          callbackRef.current?.(payload);
        }
      )
      .subscribe((status: string) => {
        setConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      sb.removeChannel(channel);
    };
  }, [table, event]);

  return { connected };
}

export function useRealtimeRefresh(tables: string[], refreshFn: () => void) {
  const [connected, setConnected] = useState(false);
  const refreshRef = useRef(refreshFn);
  refreshRef.current = refreshFn;

  useEffect(() => {
    const sb = getSupabaseBrowser();
    const channels: RealtimeChannel[] = [];

    for (const table of tables) {
      const channel = sb
        .channel(`refresh-${table}`)
        .on(
          "postgres_changes" as "system",
          { event: "*", schema: "public", table } as Record<string, unknown>,
          () => {
            refreshRef.current();
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
  }, [tables.join(",")]);

  return { connected };
}
