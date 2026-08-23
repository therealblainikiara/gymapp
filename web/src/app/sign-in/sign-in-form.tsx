"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { Card, Kicker } from "@/components/ui";

/**
 * Email magic link + Google, per C7. No password field: passwords are a
 * support burden and a breach liability for an app whose whole value is a
 * synced plan, and the user never asked for one.
 */
export default function SignInForm({
  next,
  initialError,
}: {
  next: string;
  initialError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await browserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function google() {
    setBusy(true);
    setError(null);
    const { error } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setBusy(false);
      setError(error.message);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <Card
        className="elev-md"
        style={{
          maxWidth: 420,
          width: "100%",
          padding: 26,
          gap: 14,
          animation: "fadeUp .35s both",
        }}
      >
        <Kicker style={{ fontSize: 11 }}>GYM APP</Kicker>
        <h2 style={{ margin: 0, textTransform: "uppercase" }}>Sign in</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
          Your plan, streak and history follow you to any device. We send a
          one-time link — there is no password to remember.
        </p>

        {sent ? (
          <div
            style={{
              border: "1px solid var(--color-accent)",
              padding: 14,
              fontSize: 13.5,
            }}
          >
            Link sent to <strong>{email}</strong>. Open it on the device you
            want to train on — it signs you in there.
          </div>
        ) : (
          <form
            onSubmit={sendLink}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy || !email.trim()}
            >
              {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "2px 0",
          }}
        >
          <span
            style={{ flex: 1, height: 1, background: "var(--color-divider)" }}
          />
          <span className="card-meta">OR</span>
          <span
            style={{ flex: 1, height: 1, background: "var(--color-divider)" }}
          />
        </div>

        <button
          type="button"
          onClick={google}
          className="btn btn-secondary btn-block"
          disabled={busy}
        >
          Continue with Google
        </button>

        {error && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--color-accent-700)",
            }}
            role="alert"
          >
            {error}
          </p>
        )}

        <p className="card-meta" style={{ margin: 0 }}>
          Gym App is not medical advice. You will be asked to read and accept a
          health and liability disclaimer before the app opens.
        </p>
      </Card>
    </div>
  );
}
