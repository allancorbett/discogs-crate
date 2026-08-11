"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionInfo } from "@/lib/discogs/types";

interface UseSession {
  session: SessionInfo | null;
  /** True until the initial session check resolves. */
  checking: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function useSession(): UseSession {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session")
      .then((response) => response.json() as Promise<SessionInfo>)
      .catch(() => ({ authenticated: false }) as SessionInfo)
      .then((info) => {
        if (!cancelled) {
          setSession(info);
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (token: string) => {
    const response = await fetch("/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error(
        await readError(response, "Could not sign in to Discogs."),
      );
    }

    setSession((await response.json()) as SessionInfo);
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({ authenticated: false });
  }, []);

  return { session, checking, signIn, signOut };
}
