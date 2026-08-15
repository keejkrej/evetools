export type ClerkTokenGetter = () => Promise<string | null>;

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function createAuthenticatedFetch(
  getToken: ClerkTokenGetter,
  fetchImplementation: FetchImplementation = fetch,
): FetchImplementation {
  return async (input, init) => {
    const token = await getToken();
    if (!token) {
      throw new Error("Authentication required. Please sign in again.");
    }

    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request
        ? input.headers
        : undefined,
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set("Authorization", `Bearer ${token}`);

    return fetchImplementation(input, { ...init, headers });
  };
}
