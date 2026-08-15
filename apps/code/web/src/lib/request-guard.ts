const LOOPBACK_HOSTNAMES = new Set([
  "127.0.0.1",
  "[::1]",
  "::1",
  "localhost",
]);

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

function parseHost(host: string): URL | null {
  if (!host || host.includes(",")) return null;
  try {
    const parsed = new URL(`http://${host.trim()}`);
    return parsed.pathname === "/" && !parsed.username && !parsed.password
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function isLocalSameOriginRequest(request: Request): boolean {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }
  if (
    !["http:", "https:"].includes(requestUrl.protocol) ||
    !isLoopbackHostname(requestUrl.hostname)
  ) {
    return false;
  }

  const hostHeader = request.headers.get("host");
  const authority = hostHeader ? parseHost(hostHeader) : requestUrl;
  if (
    !authority ||
    !isLoopbackHostname(authority.hostname) ||
    authority.port !== requestUrl.port
  ) {
    return false;
  }
  const forwardedHostHeader = request.headers.get("x-forwarded-host");
  if (forwardedHostHeader) {
    const forwardedAuthority = parseHost(forwardedHostHeader);
    if (!forwardedAuthority || forwardedAuthority.host !== authority.host) return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (fetchSite && fetchSite !== "same-origin") return false;
  try {
    const parsedOrigin = new URL(origin);
    return (
      isLoopbackHostname(parsedOrigin.hostname) &&
      parsedOrigin.origin === `${requestUrl.protocol}//${authority.host}`
    );
  } catch {
    return false;
  }
}

export function enforceLocalRequest(request: Request): Response | null {
  if (isLocalSameOriginRequest(request)) return null;
  return Response.json(
    { error: "Evecode API requests must come from its local origin." },
    {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
