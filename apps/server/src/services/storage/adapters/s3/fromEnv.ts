import type { S3Config } from "./types";

/**
 * Read S3 config from the environment, or `undefined` when it isn't fully set.
 *
 * Accepts the standard `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` names and
 * falls back to the shorter `AWS_ACCESS_KEY`/`AWS_SECRET_KEY`.
 */
export function s3ConfigFromEnv(): S3Config | undefined {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_KEY;
  const prefix = process.env.AWS_S3_PREFIX;

  if (!region || !bucket || !accessKeyId || !secretAccessKey) return undefined;
  return { region, bucket, accessKeyId, secretAccessKey, prefix };
}
