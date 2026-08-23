"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { DISCLAIMER_CONSENT, DISCLAIMER_VERSION } from "@/lib/disclaimer";
import { DisclaimerText } from "@/components/disclaimer-text";
import { Card, Kicker } from "@/components/ui";

/**
 * The disclaimer gate.
 *
 * Acceptance is written straight to Postgres rather than queued in the outbox.
 * Everything else in this app is local-first, and this is the one thing that
 * must not be: the proxy reads `disclaimer_accepted_at` from the server on
 * every request, and the record exists to be evidence. An acceptance sitting
 * in an outbox on a phone that never reconnects is not evidence of anything.
 */
export default function DisclaimerGate({
  alreadyAccepted,
  intakeDone,
  next,
}: {
  alreadyAccepted: boolean;
  intakeDone: boolean;
  next: string | null;
}) {
  const router = useRouter();

  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = () => {
    if (!intakeDone) return "/intake";
    return next ?? "/home";
  };

  async function accept() {
    setBusy(true);
    setError(null);
    const supabase = browserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setError("Your session expired. Sign in again to continue.");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        disclaimer_accepted_at: new Date().toISOString(),
        disclaimer_version: DISCLAIMER_VERSION,
      })
      .eq("id", user.id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    router.replace(destination());
    router.refresh();
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
          maxWidth: 640,
          padding: 26,
          gap: 14,
          animation: "fadeUp .35s both",
        }}
      >
        <Kicker style={{ fontSize: 11 }}>GYM APP — BEFORE YOU START</Kicker>
        <h2 style={{ margin: 0, textTransform: "uppercase" }}>
          Health &amp; liability disclaimer
        </h2>

        <DisclaimerText />

        {alreadyAccepted ? (
          <>
            <p className="card-meta" style={{ margin: 0 }}>
              You accepted this version on your account. Nothing to do — this
              screen is here so you can re-read it whenever you want.
            </p>
            <button
              onClick={() => router.push(intakeDone ? "/setup" : "/intake")}
              className="btn btn-secondary btn-block"
            >
              Back to the app
            </button>
          </>
        ) : (
          <>
            <label
              className="radio"
              style={{ alignItems: "flex-start", gap: 10 }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span
                className="dot"
                style={{
                  borderRadius: 0,
                  background: checked ? "var(--color-accent)" : "transparent",
                  borderColor: checked
                    ? "var(--color-accent)"
                    : "var(--color-divider)",
                }}
              />
              <span style={{ fontSize: 13.5 }}>{DISCLAIMER_CONSENT}</span>
            </label>
            <button
              onClick={accept}
              disabled={!checked || busy}
              className="btn btn-primary btn-block"
            >
              {busy ? "Saving…" : "Accept & continue"}
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
      </Card>
    </div>
  );
}
