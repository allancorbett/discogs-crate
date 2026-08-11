"use client";

import { AuthGate } from "@/components/AuthGate";
import { Crate } from "@/components/Crate";
import { useSession } from "@/hooks/useSession";

export default function Home() {
  const { session, checking, signIn, signOut } = useSession();

  // Nothing renders during the session check — it's a single fast request, and
  // flashing the sign-in form at a returning user is worse than a blank beat.
  if (checking || !session) return null;

  if (!session.authenticated || !session.username) {
    return <AuthGate onSignIn={signIn} />;
  }

  return <Crate username={session.username} onSignOut={signOut} />;
}
