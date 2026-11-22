import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { APP_NAME } from "@/lib/game/constants";

export const metadata: Metadata = {
  title: `${APP_NAME} | Lords of the Silk Road`,
  description:
    "A multiplayer maritime trade game where captains share a synchronized Silk Road voyage.",
  keywords: [
    APP_NAME,
    "multiplayer game",
    "Silk Road",
    "maritime trade",
    "Next.js",
  ],
  authors: [{ name: "Joe Zhou" }, { name: "Aaron Zhu" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
