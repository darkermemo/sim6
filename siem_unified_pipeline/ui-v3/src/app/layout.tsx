import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { Watermark } from "@/components/Watermark";

export const metadata: Metadata = {
  title: "SIEM UI v3",
  description: "Next.js + shadcn/ui isolated app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider>
          <Providers>
            <AppShell>
              {children}
              <Watermark />
            </AppShell>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
