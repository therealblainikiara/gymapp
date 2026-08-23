import { describe, expect, it } from "vitest";
import { describeAuthError } from "./auth-errors";

describe("auth error messages", () => {
  it("names the email rate limit, which is the one that looks like breakage", () => {
    // Supabase's built-in email service allows only a couple of messages an
    // hour. Hitting it is indistinguishable from delivery silently failing
    // unless the message says so.
    const byCode = describeAuthError("something", "over_email_send_rate_limit");
    expect(byCode.text).toMatch(/too many sign-in emails/i);
    expect(byCode.hint).toMatch(/per hour|custom SMTP/i);

    const byMessage = describeAuthError("Email rate limit exceeded");
    expect(byMessage.text).toMatch(/too many sign-in emails/i);
  });

  it("keeps the per-address cooldown message, which carries the wait time", () => {
    const r = describeAuthError(
      "For security purposes, you can only request this after 47 seconds.",
    );
    expect(r.text).toContain("47 seconds");
  });

  it("explains a rejected redirect as a configuration gap", () => {
    const r = describeAuthError("Redirect URL not allowed");
    expect(r.text).toMatch(/allowed redirect list/i);
    expect(r.hint).toMatch(/auth\/callback/);
  });

  it("rewrites the provider error the Google button produced", () => {
    const r = describeAuthError(
      "Unsupported provider: provider is not enabled",
    );
    expect(r.text).toMatch(/isn’t switched on/i);
    // "Unsupported provider" reads as "this app does not support Google",
    // which is the wrong conclusion.
    expect(r.text).not.toMatch(/unsupported/i);
  });

  it("passes anything unrecognised through unchanged", () => {
    // Better a raw message than a wrong guess at what it means.
    expect(describeAuthError("Some novel failure").text).toBe(
      "Some novel failure",
    );
    expect(describeAuthError("Some novel failure").hint).toBeUndefined();
  });
});

describe("magic-link click failures", () => {
  it("explains the PKCE cross-browser case in terms of what to do", () => {
    // The most common way a link that arrived fine still fails on click.
    const r = describeAuthError(
      "invalid request: both auth code and code verifier should be non-empty",
    );
    expect(r.text).toMatch(/same browser/i);
    expect(r.hint).toMatch(/request a new link/i);
    expect(r.text).not.toMatch(/code verifier/i);
  });

  it("covers a mismatched code challenge too", () => {
    expect(
      describeAuthError("code challenge does not match previously saved code verifier")
        .text,
    ).toMatch(/same browser/i);
  });

  it("treats an expired and an already-used link the same way", () => {
    for (const msg of [
      "Email link is invalid or has expired",
      "One-time token not found",
    ]) {
      const r = describeAuthError(msg);
      expect(r.text).toMatch(/expired or was already used/i);
      // Email scanners consume links by previewing them, which is worth saying.
      expect(r.hint).toMatch(/single-use|previewing/i);
    }
    expect(describeAuthError("access denied", "otp_expired").text).toMatch(
      /expired or was already used/i,
    );
  });
});
