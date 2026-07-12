import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// baseURL defaults to the current origin in the browser, so no config is needed
// for same-origin usage.
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
