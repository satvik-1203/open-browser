import { sessions } from "@/lib/browsers";
import { handleSessionEnd } from "@/services/browser/handleSessionEnd";

export async function closeAllBrowsers(): Promise<void> {
  await Promise.all(
    [...sessions.values()].map(async (session) => {
      // The server is going down, so report each as `server-error` and flush the
      // callback (await delivery) before the process exits. `handleSessionEnd`
      // disposes the runtime, which is what actually destroys a remote sandbox —
      // without it a restart would strand one per live session, billing until
      // its auto-stop interval expires.
      await handleSessionEnd(session, {
        status: "server-error",
        flush: true,
      }).catch(() => {});
    }),
  );
  sessions.clear();
}
