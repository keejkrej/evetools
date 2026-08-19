export function normalizeApiUrl(
  value: string | undefined,
  allowInsecureHttp: boolean,
): string | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" &&
      !(allowInsecureHttp && url.protocol === "http:")
    ) {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) return null;

    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
