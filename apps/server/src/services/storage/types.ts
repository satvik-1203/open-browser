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
export interface ServerStorageAdapter {
  store(input: StoreInput): Promise<StoreResult>;
}
