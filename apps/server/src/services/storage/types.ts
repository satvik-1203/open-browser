import type { Readable } from "node:stream";

export interface StoreInput {
  /** Full object key within the adapter's bucket. */
  key: string;
  body: Readable | Buffer;
  contentType: string;
}

export interface StoreResult {
  key: string;
  /** Resolvable URL to the stored object. */
  url: string;
}

/**
 * A storage backend. The interface is the seam that future methods
 * (get/delete/presign) and backends slot into.
 */
export interface StorageAdapter {
  store(input: StoreInput): Promise<StoreResult>;
  /** Resolvable URL for an object key. Deterministic; does not check existence. */
  url(key: string): string;
  /**
   * Short-lived signed URL granting read access to a private object, so a
   * client without credentials can fetch it directly.
   */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** Whether an object exists at `key`. */
  exists(key: string): Promise<boolean>;
}

/** The storage backend this server resolved from its environment. */
export interface StorageConfig {
  adapter: StorageAdapter;
  /** Key prefix applied to every stored object. */
  prefix?: string;
}

/**
 * A pluggable storage backend. Each backend lives in its own folder under
 * `adapters/` and exports one of these; register it in `getStorage.ts`.
 */
export interface StorageProvider {
  /** Discriminator for logs/errors, e.g. "s3". */
  readonly name: string;
  /** Build this backend from the environment, or `undefined` if unconfigured. */
  fromEnv(): StorageConfig | undefined;
}
