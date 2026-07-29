import { sessions } from "@/lib/browsers";
import { handleSessionEnd } from "@/services/browser/handleSessionEnd";
import { drainPool } from "@/services/browser/pool";

export async function closeAllBrowsers(): Promise<void> {
  // Warm browsers belong to no session, so nothing else would ever close them —
  // they'd survive the shutdown as orphaned Chrome processes.
  await drainPool();
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
