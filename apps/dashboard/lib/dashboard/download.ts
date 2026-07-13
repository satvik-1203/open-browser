/**
 * Trigger a download for a resolved recording URL. Tries a blob fetch so the
 * file saves directly (staying on the page); falls back to a plain anchor when
 * the storage host blocks cross-origin reads.
 */
export async function downloadFile(
  url: string,
  filename: string,
): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchor(objectUrl, filename);
    URL.revokeObjectURL(objectUrl);
  } catch {
    triggerAnchor(url, filename);
  }
}

function triggerAnchor(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
