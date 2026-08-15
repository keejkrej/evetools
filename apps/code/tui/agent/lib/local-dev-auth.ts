import {
  ForbiddenError,
  localDev,
  type AuthFn,
} from "eve/channels/auth";

const ALLOWED_BROWSER_FETCH_SITES = new Set(["none", "same-origin"]);

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function authorityHostname(authority: string | null): string | undefined {
  if (!authority) return undefined;
  try {
    const parsed = new URL(`http://${authority}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return undefined;
    }
    return parsed.hostname;
  } catch {
    return undefined;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      isLoopbackHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Protects the process-scoped Eve development credential from browser CSRF
 * and DNS rebinding. Port equality is intentionally not required because the
 * Next.js adapter proxies its own loopback origin to Eve's loopback port.
 */
export function isTrustedLocalEveRequest(request: Request): boolean {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }

  const hostHostname = authorityHostname(request.headers.get("host"));
  if (!isLoopbackHostname(requestUrl.hostname) || !hostHostname || !isLoopbackHostname(hostHostname)) {
    return false;
  }
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost !== null) {
    const forwardedHostname = authorityHostname(forwardedHost);
    if (!forwardedHostname || !isLoopbackHostname(forwardedHostname)) return false;
  }

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (!origin) {
    // Eve's TUI and CLI clients send neither browser header. Same-origin GETs
    // may omit Origin, but still carry acceptable Fetch Metadata.
    return fetchSite === undefined || ALLOWED_BROWSER_FETCH_SITES.has(fetchSite);
  }

  return isLoopbackOrigin(origin) && fetchSite !== undefined && ALLOWED_BROWSER_FETCH_SITES.has(fetchSite);
}

/**
 * Delegates environment detection and principal construction to Eve while
 * adding request-level checks before its local-dev principal can be returned.
 */
export function guardedLocalDev(): AuthFn<Request> {
  const authenticate = localDev();
  return async (request) => {
    const trusted = isTrustedLocalEveRequest(request);
    const auth = await authenticate(request);
    if (auth && !trusted) {
      throw new ForbiddenError({
        code: "evecode_untrusted_local_request",
        message: "Local Evecode requests must originate from a loopback client.",
      });
    }
    return auth;
  };
}
