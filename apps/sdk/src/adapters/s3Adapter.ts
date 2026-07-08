import type { StorageAdapterDescriptor } from "@repo/types";
import type { S3AdapterConfig, StorageAdapter } from "@/adapters/types";

/** Stores session recordings in an Amazon S3 bucket. */
export class S3Adapter implements StorageAdapter {
  constructor(private readonly config: S3AdapterConfig) {}

  serialize(): StorageAdapterDescriptor {
    return { type: "s3", ...this.config };
  }
}
