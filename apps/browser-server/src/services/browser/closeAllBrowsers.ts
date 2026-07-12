import { sessions } from "@/lib/browsers";
import { finalizeRecording } from "@/services/browser/finalizeRecording";

export async function closeAllBrowsers(): Promise<void> {
  await Promise.all(
    [...sessions.values()].map(async (session) => {
      if (session.recorder) {
        await finalizeRecording(session).catch(() => {});
      }
      await session.browser.close().catch(() => {});
    }),
  );
  sessions.clear();
}
