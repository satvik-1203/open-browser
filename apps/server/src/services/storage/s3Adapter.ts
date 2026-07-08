import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { S3StorageAdapterDescriptor } from "@repo/types";
import type {
  ServerStorageAdapter,
  StoreInput,
  StoreResult,
} from "@/services/storage/types";

export function createS3Adapter(
  descriptor: S3StorageAdapterDescriptor,
): ServerStorageAdapter {
  const client = new S3Client({
    region: descriptor.region,
    credentials: {
      accessKeyId: descriptor.accessKeyId,
      secretAccessKey: descriptor.secretAccessKey,
    },
  });

  return {
    async store({ key, body, contentType }: StoreInput): Promise<StoreResult> {
      const upload = new Upload({
        client,
        params: {
          Bucket: descriptor.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        },
      });
      await upload.done();

      return {
        key,
        url: `https://${descriptor.bucket}.s3.${descriptor.region}.amazonaws.com/${key}`,
      };
    },
  };
}
