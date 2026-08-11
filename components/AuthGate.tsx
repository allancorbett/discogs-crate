"use client";

import { useState } from "react";
import styles from "./AuthGate.module.css";

const TOKEN_SETTINGS_URL = "https://www.discogs.com/settings/developers";

interface Props {
  onSignIn: (token: string) => Promise<void>;
}

export function AuthGate({ onSignIn }: Props) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim() || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onSignIn(token.trim());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not sign in to Discogs.",
      );
      setBusy(false);
    }
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Crate</p>
        <h1 className={styles.heading}>Your record collection, as covers.</h1>
        <p className={styles.blurb}>
          Connect your Discogs account to flip through your collection and let
          it pick something for you to play.
        </p>

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
            disabled={busy}
          />
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Checking…" : "Open my crate"}
          </button>
        </form>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

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
      </div>
    </main>
  );
}
