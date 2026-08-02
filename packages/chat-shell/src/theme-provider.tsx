"use client";

import type * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider storageKey="eve-color-theme-v2" {...props}>
      {children}
    </NextThemesProvider>
  );
}
