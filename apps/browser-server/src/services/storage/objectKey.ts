/** Join an optional key prefix with an object name, normalizing slashes. */
export function objectKey(prefix: string | undefined, name: string): string {
  if (!prefix) return name;
  const trimmed = prefix.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/${name}` : name;
}
