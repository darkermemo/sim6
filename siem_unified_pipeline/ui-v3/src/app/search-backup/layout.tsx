import type { Metadata } from "next";
import "../globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Search • Focus Mode",
  description: "Full-screen search workspace",
};

export default function SearchLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Full-screen, no AppShell – maximizes real estate for search tools
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider>
          <Providers>
            <main className="min-h-screen">{children}</main>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}


