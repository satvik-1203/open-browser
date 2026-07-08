import type { StorageProvider } from "@/services/storage/types";
import { s3ConfigFromEnv } from "./fromEnv";
import { createS3Adapter } from "./s3Adapter";

/** S3 storage backend, configured from AWS_* environment variables. */
export const s3StorageProvider: StorageProvider = {
  name: "s3",
  fromEnv() {
    const config = s3ConfigFromEnv();
    return config
      ? { adapter: createS3Adapter(config), prefix: config.prefix }
      : undefined;
  },
};

export { createS3Adapter } from "./s3Adapter";
export { s3ConfigFromEnv } from "./fromEnv";
export type { S3Config } from "./types";
