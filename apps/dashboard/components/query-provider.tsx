"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef } from "react";
import type { ReactNode } from "react";

/**
 * Provides a single React Query client to the whole app. The client is created
 * once and kept in a ref so it survives re-renders (never recreated, which would
 * drop the cache).
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<QueryClient | null>(null);
  const client = (clientRef.current ??= new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 5_000,
        retry: 1,
      },
    },
  }));

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
