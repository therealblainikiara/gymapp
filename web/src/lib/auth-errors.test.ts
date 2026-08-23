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
