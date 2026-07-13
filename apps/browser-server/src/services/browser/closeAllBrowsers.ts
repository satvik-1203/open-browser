import { sessions } from "@/lib/browsers";
import { handleSessionEnd } from "@/services/browser/handleSessionEnd";

export async function closeAllBrowsers(): Promise<void> {
  await Promise.all(
    [...sessions.values()].map(async (session) => {
      // The server is going down, so report each as `server-error` and flush the
      // callback (await delivery) before the process exits.
      await handleSessionEnd(session, {
        status: "server-error",
        flush: true,
      }).catch(() => {});
      await session.browser.close().catch(() => {});
    }),
  );
  sessions.clear();
}
