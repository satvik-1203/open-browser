import { sessions } from "@/lib/browsers";
import { handleSessionEnd } from "@/services/browser/handleSessionEnd";
import type { StopBrowserResult } from "@/services/browser/types";

export async function stopBrowser(
  id: string,
): Promise<StopBrowserResult | undefined> {
  const session = sessions.get(id);
  if (!session) return undefined;

  // Settle the session as a clean `stopped` (encode + upload any recording while
  // the page is still alive, drop it from the map, fire the callback) before
  // closing the browser.
  await handleSessionEnd(session, { status: "stopped" });

  // Closing fires `disconnected`, but handleSessionEnd already ran, so its
  // guard makes the second pass a no-op.
  await session.browser.close();
  return { recording: session.recording };
}
