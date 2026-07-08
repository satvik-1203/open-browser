import { s3StorageProvider } from "@/services/storage/adapters/s3/index";
import type { StorageConfig, StorageProvider } from "@/services/storage/types";

/**
 * Registered storage backends, in priority order: the first one configured in
 * the environment wins. Adding a backend is a two-step change — drop a folder
 * under `adapters/` and add its provider here.
 */
const providers: StorageProvider[] = [s3StorageProvider];

let cached: StorageConfig | null | undefined;

/**
 * The server's recording storage, resolved once from the environment and
 * cached. Returns `undefined` when no backend is configured.
 */
export function getStorage(): StorageConfig | undefined {
  if (cached === undefined) {
    cached = null;
    for (const provider of providers) {
      const config = provider.fromEnv();
      if (config) {
        cached = config;
        break;
      }
    }
  }
  return cached ?? undefined;
}

/** Whether recording can be stored on this server. */
export function isStorageConfigured(): boolean {
  return getStorage() !== undefined;
}
