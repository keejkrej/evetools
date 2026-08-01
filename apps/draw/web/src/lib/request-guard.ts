type RateRecord = {
  active: number;
  requests: number[];
};

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;
const MAX_ACTIVE = 3;
const records = new Map<string, RateRecord>();

function clientId(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function hasAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!forwardedHost) return false;
  try {
    return new URL(origin).host === forwardedHost.split(",")[0].trim();
  } catch {
    return false;
  }
}

export function acquireRequestSlot(request: Request) {
  const id = clientId(request);
  const now = Date.now();
  const record = records.get(id) ?? { active: 0, requests: [] };
  record.requests = record.requests.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (record.requests.length >= MAX_REQUESTS || record.active >= MAX_ACTIVE) {
    records.set(id, record);
    return {
      allowed: false as const,
      retryAfter: Math.max(
        1,
        Math.ceil(
          ((record.requests[0] ?? now) + WINDOW_MS - now) / 1000,
        ),
      ),
    };
  }

  record.requests.push(now);
  record.active += 1;
  records.set(id, record);
  return {
    allowed: true as const,
    release() {
      const current = records.get(id);
      if (!current) return;
      current.active = Math.max(0, current.active - 1);
      if (current.active === 0 && current.requests.length === 0) {
        records.delete(id);
      }
    },
  };
}
