import { RecordingPlayer } from "@/components/dashboard/recording-player";

export default async function RecordingPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RecordingPlayer id={id} />;
}
