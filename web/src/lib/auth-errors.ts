/**
 * Turn Supabase auth errors into something a user can act on.
 *
 * These are the failures that actually reach the sign-in page, and every one of
 * them is a configuration or quota condition rather than anything the user did
 * wrong. Supabase's own wording describes the mechanism ("Unsupported
 * provider", "over_email_send_rate_limit"), which reads like the app is broken.
 * The messages below say what happened and what to do next.
 *
 * The rate limit is the one that catches people out: Supabase's built-in email
 * service allows only a couple of messages an hour per project. It is meant for
 * development, not for a demo several people are trying. Hitting it looks
 * exactly like email delivery silently breaking — which is why the message
 * names it.
 */
export function describeAuthError(
  message: string,
  code?: string,
): { text: string; hint?: string } {
  const m = message.toLowerCase();
  const c = (code ?? "").toLowerCase();

  if (c.includes("over_email_send_rate_limit") || /rate limit/.test(m)) {
    return {
      text: "Too many sign-in emails have been sent from this app recently.",
      hint: "Supabase's built-in email service allows only a couple per hour. Wait a few minutes and try again, or configure custom SMTP to lift the limit.",
    };
  }

  // Supabase asks the caller to wait N seconds between requests for the same
  // address; the number is in the original message, so keep it.
  if (/you can only request this after/.test(m)) {
    return { text: message, hint: "This is a per-address cooldown, not a failure." };
  }

  if (/redirect/.test(m) && /(not allowed|invalid)/.test(m)) {
    return {
      text: "This app's address isn't on the allowed redirect list for sign-in.",
      hint: "Add this origin + /auth/callback under Authentication → URL Configuration in Supabase.",
    };
  }

  if (/provider is not enabled|unsupported provider/.test(m)) {
    return {
      text: "That sign-in method isn’t switched on for this app yet.",
      hint: "Use the email link instead.",
    };
  }

  if (/signups? (not allowed|disabled)/.test(m)) {
    return { text: "New sign-ups are currently disabled for this app." };
  }

  if (/invalid email|unable to validate email/.test(m)) {
    return { text: "That doesn’t look like a valid email address." };
  }

  return { text: message };
}
