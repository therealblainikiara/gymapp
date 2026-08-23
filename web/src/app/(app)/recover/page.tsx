import RecoverScreen from "./recover-screen";

export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ breathe?: string }>;
}) {
  const { breathe } = await searchParams;
  return <RecoverScreen startBreathing={breathe === "1"} />;
}
