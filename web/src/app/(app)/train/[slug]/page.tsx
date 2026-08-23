import { notFound } from "next/navigation";
import { exerciseFromSlug, findExercise } from "@/lib/domain/exercises";
import ExerciseDetail from "./exercise-detail";

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const name = exerciseFromSlug(slug);
  if (!name) notFound();
  const exercise = findExercise(name);
  if (!exercise) notFound();
  return <ExerciseDetail exercise={exercise} />;
}
