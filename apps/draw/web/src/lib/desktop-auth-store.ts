type PendingAuthentication = { expiresAt: number; token: string };

const storeKey = Symbol.for("evetools.evedraw.desktop-auth");
const globalStore = globalThis as typeof globalThis & {
  [storeKey]?: Map<string, PendingAuthentication>;
};

function store() {
  return (globalStore[storeKey] ??= new Map());
}

function removeExpired() {
  const now = Date.now();
  for (const [state, authentication] of store()) {
    if (authentication.expiresAt <= now) store().delete(state);
  }
}

export function publishDesktopAuthentication(state: string, token: string) {
  removeExpired();
  store().set(state, { expiresAt: Date.now() + 5 * 60_000, token });
}

export function consumeDesktopAuthentication(state: string) {
  removeExpired();
  const authentication = store().get(state);
  if (!authentication) return;
  store().delete(state);
  return authentication.token;
}

export function resetDesktopAuthenticationStore() {
  store().clear();
}
