import { BrowserDetail } from "@/components/dashboard/browser-detail";

export default async function BrowserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BrowserDetail id={id} />;
}
