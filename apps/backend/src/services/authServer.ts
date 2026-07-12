import { logger } from "@repo/logger";

import { authServerUrl } from "@/config";

export interface AuthSession {
  userId: string;
}

/**
 * Client for the Next.js auth server (apps/dashboard). Validates a forwarded
 * user session by calling better-auth's `/api/auth/get-session` with the
 * caller's cookies (and any Authorization header), returning the resolved
 * session or null. Never throws — a network/parse failure resolves to null so
 * the caller just treats it as "not authenticated".
 */
export const authServer = {
  async getSession(headers: {
    cookie?: string;
    authorization?: string;
  }): Promise<AuthSession | null> {
    const { cookie, authorization } = headers;
    if (!cookie && !authorization) return null;

    try {
      const resp = await fetch(`${authServerUrl}/api/auth/get-session`, {
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(authorization ? { authorization } : {}),
        },
      });
      if (!resp.ok) return null;

      const data = (await resp.json().catch(() => null)) as {
        user?: { id?: unknown };
      } | null;
      const userId = data?.user?.id;
      return typeof userId === "string" ? { userId } : null;
    } catch (error) {
      logger.warn("auth server session validation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },
};
