import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { GymStoreProvider } from "@/lib/local/provider";
import AppShell from "@/components/app-shell";
import { PREVIEW_HARNESS, PREVIEW_USER_ID } from "@/lib/preview";

/**
 * Everything behind the gate. The proxy has already checked the disclaimer and
 * intake before this renders; the user lookup here is what gives the local
 * store its identity (and therefore which IndexedDB database to open).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Preview harness: a fixed fake identity, and no auth call at all. Falling
  // through to getUser() would reach for a Supabase project that the harness
  // deliberately does not have.
  if (PREVIEW_HARNESS) {
    return (
      <GymStoreProvider userId={PREVIEW_USER_ID}>
        <AppShell>{children}</AppShell>
      </GymStoreProvider>
    );
  }

  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <GymStoreProvider userId={user.id}>
      <AppShell>{children}</AppShell>
    </GymStoreProvider>
  );
}
