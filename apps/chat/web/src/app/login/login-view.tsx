"use client";

import { LoginView as SharedLoginView } from "@evetools/chat-shell/login-view";

export function LoginView({ redirectUrl }: { redirectUrl: string }) {
  return <SharedLoginView desktopShell={false} redirectUrl={redirectUrl} />;
}
