/**
 * Trigger a download for a recording URL. The URL is presigned with
 * `Content-Disposition: attachment`, so navigating to it saves the file to disk
 * (instead of rendering inline) even though S3 is a different origin — the
 * `download` attribute alone is ignored cross-origin.
 */
export function downloadFile(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename; // best-effort hint; the URL's Content-Disposition wins
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
