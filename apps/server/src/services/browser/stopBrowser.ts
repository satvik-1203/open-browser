import { sessions } from "@/lib/browsers";
import { finalizeRecording } from "@/services/browser/finalizeRecording";
import type { StopBrowserResult } from "@/services/browser/types";

export async function stopBrowser(
  id: string,
): Promise<StopBrowserResult | undefined> {
  const session = sessions.get(id);
  if (!session) return undefined;

  // Encode + upload the recording (if any) while the page is still alive, then
  // tear the browser down.
  if (session.recorder) {
    await finalizeRecording(session);
  }

  await session.browser.close();
  sessions.delete(id);
  return { recording: session.recording };
}
