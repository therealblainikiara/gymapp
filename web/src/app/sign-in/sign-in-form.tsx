"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { Card, Kicker } from "@/components/ui";
import { describeAuthError } from "@/lib/auth-errors";

/**
 * Set NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true once Google is configured in
 * Dashboard → Authentication → Providers. Until then the button is hidden —
 * clicking a provider that is not enabled returns a raw "Unsupported provider"
 * that reads like the app is broken.
 */
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

/**
 * Password sign-in, on by default.
 *
 * Magic links are the primary route and the nicer one, but they put email
 * delivery on the critical path: the built-in Supabase sender allows only a
 * couple of messages an hour, and a link opened in a different browser from
 * the one that requested it cannot complete the PKCE exchange. Either of those
 * locks everyone out with no way back in.
 *
 * A password is the escape hatch that depends on nothing external. Set
 * NEXT_PUBLIC_ENABLE_PASSWORD_AUTH=false to hide it.
 */
const PASSWORD_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PASSWORD_AUTH !== "false";

type Mode = "link" | "password";

export default function SignInForm({
  next,
  initialError,
}: {
  next: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Errors arriving from the callback route are raw Supabase text, so they go
  // through the same humanising pass as the ones raised here.
  const described = initialError ? describeAuthError(initialError) : null;
  const [error, setError] = useState<string | null>(described?.text ?? null);
  const [hint, setHint] = useState<string | null>(described?.hint ?? null);

  function fail(message: string, code?: string) {
    const d = describeAuthError(message, code);
    setError(d.text);
    setHint(d.hint ?? null);
  }

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    const { error } = await browserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    setBusy(false);
    if (error) {
      fail(error.message, error.code);
      return;
    }
    setSent(true);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    const { error } = await browserClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setBusy(false);
      fail(error.message, error.code);
      return;
    }
    // The session cookie is set; the proxy decides where this lands —
    // disclaimer, intake, or straight through.
    router.replace(next);
    router.refresh();
  }

  async function google() {
    setBusy(true);
    setError(null);
    setHint(null);
    const { error } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setBusy(false);
      fail(error.message, error.code);
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
          Your plan, streak and history follow you to any device.
        </p>

        {sent ? (
          <div
            style={{
              border: "1px solid var(--color-accent)",
              padding: 14,
              fontSize: 13.5,
            }}
          >
            <p style={{ margin: 0 }}>
              Link sent to <strong>{email}</strong>.
            </p>
            {/* The PKCE verifier lives in this browser. Opening the link
                anywhere else cannot complete the exchange. */}
            <p style={{ margin: "8px 0 0" }}>
              <strong>Open it in this browser</strong> — it will not work on
              another device. To sign in on your phone, request a fresh link
              from the phone.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="btn btn-ghost"
              style={{ marginTop: 8, fontSize: 12.5, padding: "2px 8px" }}
            >
              ← Use a different address
            </button>
          </div>
        ) : (
          <form
            onSubmit={mode === "link" ? sendLink : signInWithPassword}
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

            {mode === "password" && (
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={
                busy ||
                !email.trim() ||
                (mode === "password" && !password)
              }
            >
              {busy
                ? mode === "link"
                  ? "Sending…"
                  : "Signing in…"
                : mode === "link"
                  ? "Email me a sign-in link"
                  : "Sign in"}
            </button>

            {PASSWORD_ENABLED && (
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "link" ? "password" : "link");
                  setError(null);
                  setHint(null);
                }}
                className="btn btn-ghost"
                style={{ fontSize: 12.5 }}
              >
                {mode === "link"
                  ? "Use a password instead"
                  : "Email me a link instead"}
              </button>
            )}
          </form>
        )}

        {GOOGLE_ENABLED && !sent && (
          <>
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
          </>
        )}

        {error && (
          <p
            style={{ margin: 0, fontSize: 13, color: "var(--color-accent-700)" }}
            role="alert"
          >
            {error}
          </p>
        )}
        {hint && (
          <p className="card-meta" style={{ margin: "-8px 0 0" }}>
            {hint}
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
