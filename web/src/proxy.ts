import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DB_SCHEMA, type Database, type DbSchema } from "@/lib/types/database";
import { DISCLAIMER_VERSION } from "@/lib/disclaimer";
import { PREVIEW_HARNESS } from "@/lib/preview";

/**
 * The gate.
 *
 * Next 16 renamed the middleware file convention to `proxy`; this is the
 * "middleware blocks all app routes" the handoff calls for. Two things happen
 * on every request: the Supabase session is refreshed so server components see
 * a live session, and the disclaimer/intake gates are enforced.
 *
 * The gate is here rather than in a layout deliberately. A client-side guard
 * can be skipped by a direct navigation and a layout check runs after the
 * route has already begun; neither is defensible as the thing standing between
 * a user and a workout plan they have not accepted the terms for.
 *
 * Bumping DISCLAIMER_VERSION re-gates everyone: the comparison below is
 * against the constant that ships with the build, not against "is it set".
 */

const PUBLIC_PREFIXES = ["/sign-in", "/auth", "/legal"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
  // The preview harness renders the signed-in screens with no session at all,
  // so the gate has nothing to check and no Supabase to check it against. See
  // lib/preview.ts for the two locks that keep this out of a deployment.
  if (PREVIEW_HARNESS) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database, DbSchema>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: DB_SCHEMA },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // getUser(), not getSession(): only the former verifies the JWT with the
  // auth server, and a gate that trusts an unverified cookie is not a gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  // API routes are gated too, but with a status a fetch() can act on. A
  // redirect here would be followed transparently and hand the caller an HTML
  // sign-in page where it expected JSON.
  const isApi = pathname.startsWith("/api/");

  if (!user) {
    if (isPublic(pathname)) return response;
    if (isApi) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    // Preserve where they were heading so the magic link lands there.
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // Signed in: the sign-in page has nothing left to offer.
  if (pathname === "/sign-in") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (isPublic(pathname)) return response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("disclaimer_accepted_at, disclaimer_version, intake_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  const accepted =
    !!profile?.disclaimer_accepted_at &&
    profile.disclaimer_version === DISCLAIMER_VERSION;

  if (!accepted && isApi) {
    return NextResponse.json(
      { error: "disclaimer_required" },
      { status: 403 },
    );
  }

  if (!accepted && pathname !== "/disclaimer") {
    const url = request.nextUrl.clone();
    url.pathname = "/disclaimer";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // The wizard runs next. Once complete it stays reachable, because Setup
  // offers "Redo the intake questionnaire".
  if (accepted && !profile?.intake_completed_at && !isApi) {
    if (pathname !== "/intake" && pathname !== "/disclaimer") {
      const url = request.nextUrl.clone();
      url.pathname = "/intake";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own assets and image requests. The gate has to
     * see real navigations; letting it run on every chunk request would add a
     * profile query to each one.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
