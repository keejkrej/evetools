import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import LoginPage from "./[[...rest]]/page";

function findRedirectUrl(node: ReactNode): string | undefined {
  if (!node || typeof node !== "object" || !("props" in node)) return;

  const props = node.props as {
    children?: ReactNode;
    forceRedirectUrl?: string;
    redirectUrl?: string;
  };
  if (props.forceRedirectUrl || props.redirectUrl) {
    return props.forceRedirectUrl ?? props.redirectUrl;
  }

  const children = Array.isArray(props.children)
    ? props.children
    : [props.children];
  for (const child of children) {
    const redirectUrl = findRedirectUrl(child);
    if (redirectUrl) return redirectUrl;
  }
}

describe("login", () => {
  it("returns web authentication to the current origin", async () => {
    expect(findRedirectUrl(await LoginPage({ searchParams: Promise.resolve({}) }))).toBe("/");
  });

  it("preserves desktop state in the external callback", async () => {
    expect(findRedirectUrl(await LoginPage({ searchParams: Promise.resolve({ desktop: "1", state: "nonce" }) }))).toBe("/desktop-auth/callback?state=nonce");
  });
});
