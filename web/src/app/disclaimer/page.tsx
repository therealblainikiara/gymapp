import { serverClient } from "@/lib/supabase/server";
import { disclaimerCurrent } from "@/lib/disclaimer";
import DisclaimerGate from "./disclaimer-gate";

export const metadata = { title: "Disclaimer — Gym App" };

export default async function DisclaimerPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("disclaimer_accepted_at, disclaimer_version, intake_completed_at")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const alreadyAccepted = profile ? disclaimerCurrent(profile) : false;

  return (
    <DisclaimerGate
      alreadyAccepted={alreadyAccepted}
      intakeDone={!!profile?.intake_completed_at}
      next={next && next.startsWith("/") && !next.startsWith("//") ? next : null}
    />
  );
}
