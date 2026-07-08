import type { StorageAdapterDescriptor } from "@repo/types";
import { createS3Adapter } from "@/services/storage/s3Adapter";
import type { ServerStorageAdapter } from "@/services/storage/types";

/** Build the server-side storage backend for a serialized adapter descriptor. */
export function createAdapter(
  descriptor: StorageAdapterDescriptor,
): ServerStorageAdapter {
  switch (descriptor.type) {
    case "s3":
      return createS3Adapter(descriptor);
  }

  throw new Error(
    `unsupported storage adapter type: ${(descriptor as { type: string }).type}`,
  );
}
