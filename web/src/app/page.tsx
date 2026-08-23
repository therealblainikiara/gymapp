import { redirect } from "next/navigation";

/**
 * The proxy already redirects "/" for signed-in users; this covers the case
 * where the matcher is bypassed (a prefetch, a static export probe) so the
 * root is never a blank page.
 */
export default function Root() {
  redirect("/home");
}
