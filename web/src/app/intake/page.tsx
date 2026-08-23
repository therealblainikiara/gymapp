import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import IntakeWizard from "./intake-wizard";

export const metadata = { title: "Build your plan — Gym App" };

export default async function IntakePage() {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return <IntakeWizard userId={user.id} initial={profile ?? null} />;
}
