import { notFound } from "next/navigation";
import { findRecoveryMove, RECOVERY_LIBRARY } from "@/lib/domain/recovery";
import { exerciseSlug } from "@/lib/domain/exercises";
import RecoveryDetail from "./recovery-detail";

/**
 * `/recover/[slug]` — the counterpart of `/train/[slug]`.
 *
 * The dose travels in the query string because it belongs to the routine that
 * prescribed the movement, not to the movement itself (C28). A movement reached
 * without one — a bookmark, a shared link — still renders; it just shows no
 * hold target, which is honest rather than inventing a duration.
 */
export default async function RecoveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ dose?: string }>;
}) {
  const { slug } = await params;
  const { dose } = await searchParams;
  const name = RECOVERY_LIBRARY.find((m) => exerciseSlug(m.n) === slug)?.n;
  if (!name) notFound();
  const move = findRecoveryMove(name);
  if (!move) notFound();
  return <RecoveryDetail move={move} dose={dose ?? ""} />;
}
