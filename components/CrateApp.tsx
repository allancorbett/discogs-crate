"use client";

import { AuthGate } from "@/components/AuthGate";
import { Crate } from "@/components/Crate";
import { useSession } from "@/hooks/useSession";

interface Props {
  /** A failure carried back from the OAuth redirect, resolved server-side. */
  signInError?: string;
}

export function CrateApp({ signInError }: Props) {
  const { session, checking, signIn, startDemo, signOut } = useSession();

  // Nothing renders during the session check — it's a single fast request, and
  // flashing the sign-in form at a returning user is worse than a blank beat.
  if (checking || !session) return null;

  if (!session.authenticated || !session.username) {
    return (
      <AuthGate
        onSignIn={signIn}
        onStartDemo={session.demoAvailable ? startDemo : undefined}
        oauthAvailable={session.oauthAvailable}
        initialError={signInError}
      />
    );
  }

  return (
    <Crate
      username={session.username}
      demo={session.demo ?? false}
      onSignOut={signOut}
    />
  );
}
