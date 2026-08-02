"use client";

import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export function LoginView({ redirectUrl }: { redirectUrl: string }) {
  return (
    <main className="flex h-dvh items-center justify-center bg-background px-5 text-foreground">
      <div className="relative flex w-full max-w-sm flex-col items-center">
        <Image alt="Eve" className="pointer-events-none absolute top-8 left-1/2 z-10 size-12 -translate-x-1/2 dark:invert" height={102} src="/eve-logo.svg" width={102} />
        <SignIn
          appearance={{
            variables: { borderRadius: "0.875rem", colorBackground: "var(--popover)", colorDanger: "var(--destructive)", colorForeground: "var(--popover-foreground)", colorMutedForeground: "var(--muted-foreground)", colorPrimary: "var(--primary)", fontFamily: "var(--font-sans)" },
            elements: { rootBox: { width: "100%" }, cardBox: { width: "100%" }, card: { backdropFilter: "blur(24px)", background: "color-mix(in oklch, var(--popover) 55%, transparent)", border: "1px solid var(--border)", borderRadius: "1.5rem", boxShadow: "0 24px 64px rgb(0 0 0 / 0.18)" }, footer: { background: "transparent", borderTop: "1px solid var(--border)" }, header: { paddingTop: "2.5rem" }, headerTitle: { display: "none" }, formButtonPrimary: { borderRadius: "0.75rem", boxShadow: "none" }, formFieldInput: { borderRadius: "0.75rem" }, socialButtonsBlockButton: { background: "transparent", borderColor: "var(--border)", borderRadius: "0.75rem" } },
          }}
          forceRedirectUrl={redirectUrl}
          path="/login"
          routing="path"
        />
      </div>
    </main>
  );
}
