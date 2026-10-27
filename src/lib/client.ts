"use client";
import { useCallback, useEffect, useState } from "react";

/** fetch wrapper: JSON in/out, throws Error(message) on non-2xx, bounces to /login on 401. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
    // full reload on purpose: drops client state when the session has expired
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

/** GET hook. `loading` is derived (no setState inside the effect body). */
export function useFetch<T>(url: string) {
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const key = `${url}#${tick}`;

  useEffect(() => {
    let alive = true;
    api<T>(url)
      .then((data) => alive && setRes({ key, data }))
      .catch((e: Error) => alive && setRes({ key, error: e.message }));
    return () => {
      alive = false;
    };
  }, [url, key]);

  const loading = res?.key !== key;
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: loading ? undefined : res?.data, error: loading ? undefined : res?.error, loading, reload };
}
