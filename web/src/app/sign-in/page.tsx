import SignInForm from "./sign-in-form";

export const metadata = { title: "Sign in — Gym App" };

/**
 * The `next` param is read here rather than with useSearchParams so the form
 * is server-rendered. Reading it in the client component would push the whole
 * page behind a Suspense boundary and ship an empty document — a blank screen
 * until JavaScript lands, on the one page every user starts from.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return <SignInForm next={safePath(next)} initialError={error ?? null} />;
}

/** Same-origin paths only, so a crafted link cannot bounce a new session off-site. */
function safePath(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
}
