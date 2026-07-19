import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./fonts.css";   // v232 — deterministic typography (see src/lib/fonts.ts)
import Sidebar from "@/components/Sidebar";
import AuthGate from "@/components/AuthGate";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND.name,
  description: "Booking and event management",
  applicationName: BRAND.name,
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// Next 14: theme-color / background belong in the viewport export, not metadata,
// or Next emits a deprecation warning (the spec asks for zero warnings).
export const viewport: Viewport = {
  themeColor: BRAND.colors.navy,
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthGate>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 px-6 py-8 lg:px-10 transition-[padding] duration-200">{children}</main>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
