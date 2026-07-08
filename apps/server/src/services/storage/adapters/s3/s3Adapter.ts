import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type {
  StorageAdapter,
  StoreInput,
  StoreResult,
} from "@/services/storage/types";
import type { S3Config } from "./types";

export function createS3Adapter(config: S3Config): StorageAdapter {
  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async store({ key, body, contentType }: StoreInput): Promise<StoreResult> {
      const upload = new Upload({
        client,
        params: {
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        },
      });
      await upload.done();

      return {
        key,
        url: `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`,
      };
    },
  };
}
