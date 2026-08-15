import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenError } from "eve/channels/auth";
import {
  guardedLocalDev,
  isTrustedLocalEveRequest,
} from "../agent/lib/local-dev-auth.js";

function localRequest({
  fetchSite,
  forwardedHost,
  host = "127.0.0.1:4317",
  origin,
  url = "http://127.0.0.1:4317/eve/v1/info",
}: {
  fetchSite?: string;
  forwardedHost?: string;
  host?: string;
  origin?: string;
  url?: string;
} = {}): Request {
  return new Request(url, {
    headers: {
      host,
      ...(forwardedHost ? { "x-forwarded-host": forwardedHost } : {}),
      ...(origin ? { origin } : {}),
      ...(fetchSite ? { "sec-fetch-site": fetchSite } : {}),
    },
  });
}

test("local Eve auth allows originless TUI requests and proxied browser ports", () => {
  assert.equal(isTrustedLocalEveRequest(localRequest()), true);
  assert.equal(isTrustedLocalEveRequest(localRequest({
    fetchSite: "same-origin",
    origin: "http://localhost:3000",
  })), true);
  assert.equal(isTrustedLocalEveRequest(localRequest({
    fetchSite: "none",
    host: "[::1]:4317",
    origin: "https://[::1]:3000",
    url: "http://[::1]:4317/eve/v1/info",
  })), true);
});

test("local Eve auth rejects cross-site, foreign-origin, and DNS-rebound requests", () => {
  assert.equal(isTrustedLocalEveRequest(localRequest({
    fetchSite: "cross-site",
    origin: "https://attacker.example",
  })), false);
  assert.equal(isTrustedLocalEveRequest(localRequest({
    fetchSite: "same-origin",
    origin: "https://attacker.example",
  })), false);
  assert.equal(isTrustedLocalEveRequest(localRequest({
    host: "attacker.example:4317",
  })), false);
  assert.equal(isTrustedLocalEveRequest(localRequest({
    forwardedHost: "attacker.example:43117",
  })), false, "the Next.js proxy preserves the browser Host in X-Forwarded-Host");
  assert.equal(isTrustedLocalEveRequest(localRequest({
    url: "http://attacker.example:4317/eve/v1/info",
  })), false);
  assert.equal(isTrustedLocalEveRequest(localRequest({
    origin: "http://127.0.0.1:3000",
  })), false, "browser requests with Origin must also carry Fetch Metadata");
});

test("the Eve local-dev principal is returned only after the request guard passes", async () => {
  const previous = process.env.EVE_DEV;
  process.env.EVE_DEV = "1";
  try {
    const authenticate = guardedLocalDev();
    assert.equal((await authenticate(localRequest()))?.principalId, "local-dev");
    await assert.rejects(
      Promise.resolve(authenticate(localRequest({
        fetchSite: "cross-site",
        origin: "https://attacker.example",
      }))),
      (error: unknown) => error instanceof ForbiddenError && error.response.status === 403,
    );
  } finally {
    if (previous === undefined) delete process.env.EVE_DEV;
    else process.env.EVE_DEV = previous;
  }
});

test("the local request guard does not authenticate production requests", async () => {
  const previous = process.env.EVE_DEV;
  delete process.env.EVE_DEV;
  try {
    assert.equal(await guardedLocalDev()(localRequest({
      fetchSite: "cross-site",
      origin: "https://attacker.example",
    })), null);
  } finally {
    if (previous === undefined) delete process.env.EVE_DEV;
    else process.env.EVE_DEV = previous;
  }
});
