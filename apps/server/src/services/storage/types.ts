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
 * A storage backend. Today it only needs to `store()`; the interface is the
 * seam that future methods (get/delete/presign) and backends slot into.
 */
export interface StorageAdapter {
  store(input: StoreInput): Promise<StoreResult>;
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
