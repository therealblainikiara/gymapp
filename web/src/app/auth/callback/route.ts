import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";

/**
 * Where magic links and the Google redirect land. Exchanges the one-time code
 * for a session cookie, then hands the user on — the proxy decides whether
 * that is the disclaimer, the intake wizard, or where they were going.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  // Only same-origin paths, so a crafted link cannot bounce a freshly
  // authenticated user off-site.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  if (!code) {
    const error = searchParams.get("error_description") ?? "missing_code";
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(error)}`,
    );
  }

  const supabase = await serverClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${target}`);
}
