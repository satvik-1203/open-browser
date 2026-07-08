import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

  const url = (key: string) =>
    `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;

  return {
    url,
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

      return { key, url: url(key) };
    },
    async exists(key: string): Promise<boolean> {
      try {
        await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        return true;
      } catch (err) {
        // A missing object surfaces as 404 (NotFound). Anything else — auth,
        // network, throttling — is a real failure the caller should hear about.
        if (
          err instanceof Error &&
          (err as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 404
        ) {
          return false;
        }
        throw err;
      }
    },
  };
}
