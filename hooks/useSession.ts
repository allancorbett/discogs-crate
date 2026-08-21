"use client";

import { useCallback, useEffect, useState } from "react";
import { clearAllCaches } from "@/lib/collectionCache";
import type { SessionInfo } from "@/lib/discogs/types";

interface UseSession {
  session: SessionInfo | null;
  /** True until the initial session check resolves. */
  checking: boolean;
  signIn: (token: string) => Promise<void>;
  /** Browse the deployment's shared demo collection instead of signing in. */
  startDemo: () => Promise<void>;
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

  const startDemo = useCallback(async () => {
    const response = await fetch("/api/auth/demo", { method: "POST" });

    if (!response.ok) {
      throw new Error(await readError(response, "The demo is unavailable."));
    }

    setSession((await response.json()) as SessionInfo);
  }, []);

  const signOut = useCallback(async () => {
    // Local first, and unconditionally: the collection the cookies authorised
    // would otherwise sit in localStorage for the rest of its day-long TTL, and
    // a failed request is exactly when it matters that it doesn't.
    clearAllCaches();

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // The cookies may outlive a network failure. The next session check
      // settles that; nothing here should block the return to the gate.
    }

    // Keep the deployment's capabilities so the gate still offers the same
    // sign-in options after signing out.
    setSession((current) => ({
      authenticated: false,
      demoAvailable: current?.demoAvailable,
      oauthAvailable: current?.oauthAvailable,
    }));
  }, []);

  return { session, checking, signIn, startDemo, signOut };
}
