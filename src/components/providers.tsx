"use client";

import { ThemeProvider } from "next-themes";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsApplier } from "@/components/SettingsApplier";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <SettingsApplier>
        <TooltipProvider>
          {children}
          {/* Direct action feedback uses Sonner. Ambient event notices use the
              notification center. The lower right position keeps rare toasts
              away from the game board. */}
          <SonnerToaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </SettingsApplier>
    </ThemeProvider>
  );
}
