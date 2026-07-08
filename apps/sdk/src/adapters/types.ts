import type { StorageAdapterDescriptor } from "@repo/types";

/**
 * A storage target the caller configures on the client. Implementations
 * serialize themselves into a wire descriptor that is sent to the server with
 * `start()`; the server reconstructs the matching backend to store recordings.
 */
export interface StorageAdapter {
  serialize(): StorageAdapterDescriptor;
}

export interface S3AdapterConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional key prefix, e.g. "recordings/". */
  prefix?: string;
}
