"use client";

import { useState } from "react";
import styles from "./AuthGate.module.css";

const TOKEN_SETTINGS_URL = "https://www.discogs.com/settings/developers";

interface Props {
  onSignIn: (token: string) => Promise<void>;
  /** Only offered when the deployment has a demo collection configured. */
  onStartDemo?: () => Promise<void>;
  /** Only offered when the deployment has Discogs app credentials. */
  oauthAvailable?: boolean;
  /** A failure carried back from the OAuth redirect, resolved server-side. */
  initialError?: string;
}

export function AuthGate({
  onSignIn,
  onStartDemo,
  oauthAvailable,
  initialError,
}: Props) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState<"token" | "demo" | "oauth" | null>(null);
  const [showToken, setShowToken] = useState(false);

  async function run(action: "token" | "demo", work: () => Promise<void>) {
    if (busy) return;

    setBusy(action);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not sign in to Discogs.",
      );
      setBusy(null);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    void run("token", () => onSignIn(token.trim()));
  }

  // With OAuth available the token field is a fallback, not the main event.
  const tokenFormOpen = !oauthAvailable || showToken;

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Crate</p>
        <h1 className={styles.heading}>Your record collection, as covers.</h1>
        <p className={styles.blurb}>
          Connect your Discogs account to flip through your collection and let
          it pick something for you to play.
        </p>

        {oauthAvailable ? (
          <a
            className={styles.submit}
            href="/api/auth/oauth/start"
            onClick={() => setBusy("oauth")}
            aria-disabled={busy !== null}
          >
            {busy === "oauth" ? "Redirecting…" : "Sign in with Discogs"}
          </a>
        ) : null}

        {tokenFormOpen ? (
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.label} htmlFor="token">
              Personal access token
            </label>
            <input
              id="token"
              className={styles.input}
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste your token"
              autoComplete="off"
              spellCheck={false}
              disabled={busy !== null}
            />
            <button
              className={oauthAvailable ? styles.secondary : styles.submit}
              type="submit"
              disabled={busy !== null}
            >
              {busy === "token" ? "Checking…" : "Open my crate"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={styles.textLink}
            onClick={() => setShowToken(true)}
          >
            Use a personal access token instead
          </button>
        )}

        {onStartDemo ? (
          <div className={styles.demo}>
            <span className={styles.or}>or</span>
            <button
              type="button"
              className={styles.demoButton}
              disabled={busy !== null}
              onClick={() => void run("demo", onStartDemo)}
            >
              {busy === "demo" ? "Loading…" : "Take a look around a demo crate"}
            </button>
            <p className={styles.demoNote}>
              Browses a sample collection, no token needed.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {tokenFormOpen ? (
          <details className={styles.help}>
            <summary>Where do I find my token?</summary>
            <ol>
              <li>
                Open{" "}
                <a
                  href={TOKEN_SETTINGS_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Discogs → Settings → Developers
                </a>
                .
              </li>
              <li>
                Under <em>Personal access token</em>, select{" "}
                <em>Generate token</em>.
              </li>
              <li>Copy the whole string and paste it above.</li>
            </ol>
            <p>
              The token is stored in a cookie that only this app&rsquo;s server
              can read, and is used solely to read your collection.
            </p>
          </details>
        ) : null}
      </div>
    </main>
  );
}
