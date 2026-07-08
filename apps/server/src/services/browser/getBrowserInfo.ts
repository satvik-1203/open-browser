import { sessions } from "@/lib/browsers";
import type { BrowserInfo } from "@/services/browser/types";

export function getBrowserInfo(id: string): BrowserInfo | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;

  return {
    id: session.id,
    connected: session.browser.connected,
    targetId: session.targetId,
    recording: session.recording,
  };
}
