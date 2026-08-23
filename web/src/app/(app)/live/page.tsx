import LiveCamera from "./live-camera";

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ ex?: string }>;
}) {
  const { ex } = await searchParams;
  return <LiveCamera exerciseName={ex || "a strength exercise"} />;
}
