/**
 * Where a session recording should be stored. Discriminated on `type` so more
 * backends (gcs, azure, ...) and credential modes can be added without breaking
 * existing callers. Today only S3 with direct keys is supported.
 */
export interface S3StorageAdapterDescriptor {
  type: "s3";
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional key prefix, e.g. "recordings/" — the browser id + extension is appended. */
  prefix?: string;
}

export type StorageAdapterDescriptor = S3StorageAdapterDescriptor;
