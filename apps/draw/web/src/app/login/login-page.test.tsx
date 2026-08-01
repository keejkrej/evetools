import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
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

describe("desktop login", () => {
  const originalDesktop = process.env.EVEDRAW_DESKTOP;

  afterEach(() => {
    if (originalDesktop === undefined) delete process.env.EVEDRAW_DESKTOP;
    else process.env.EVEDRAW_DESKTOP = originalDesktop;
  });

  it("returns OAuth authentication to the registered app scheme", () => {
    process.env.EVEDRAW_DESKTOP = "1";

    expect(findRedirectUrl(LoginPage())).toBe(
      "http://127.0.0.1:43117/desktop-auth/callback",
    );
  });

  it("keeps browser authentication on the web origin", () => {
    delete process.env.EVEDRAW_DESKTOP;

    expect(findRedirectUrl(LoginPage())).toBe("/");
  });
});
