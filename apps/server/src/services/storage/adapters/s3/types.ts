/** Resolved S3 credentials and target, read from the server environment. */
export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional key prefix, e.g. "recordings/" — the browser id + extension is appended. */
  prefix?: string;
}
