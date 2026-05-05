import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";
import Link from "next/link";
import { SmoothScrollProvider } from "@/components/effects/SmoothScrollProvider";
import { CustomCursor } from "@/components/effects/CustomCursor";
import { MissiBuddyContainer } from "@/components/buddy/MissiBuddyContainer";
import Script from "next/script";

export const metadata: Metadata = {
  title: "missiAI — AI with Memory",
  description:
    "Voice AI assistant that remembers you. Chat naturally in Hindi, English, or Hinglish.",
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
  },
  openGraph: {
    title: "missiAI — AI with Memory",
    description:
      "Voice AI assistant that remembers you. Chat naturally in Hindi, English, or Hinglish.",
    url: "https://missi.space",
    siteName: "missiAI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "missiAI — AI with Memory",
    description:
      "Voice AI assistant that remembers you. Chat naturally in Hindi, English, or Hinglish.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "missiAI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#191a17" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="missi-theme-init" strategy="beforeInteractive">
          {`
            (function () {
              var defaults = {
                theme: "light",
                accent: "amber",
                fontScale: "md",
                reduceMotion: false,
                highContrast: false
              };
              try {
                var raw = localStorage.getItem("missi-appearance");
                var parsed = raw ? JSON.parse(raw) : {};
                var settings = Object.assign({}, defaults, parsed || {});
                var resolved = settings.theme === "system"
                  ? (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
                  : settings.theme;
                var root = document.documentElement;
                root.setAttribute("data-theme", resolved);
                root.setAttribute("data-accent", settings.accent);
                root.setAttribute("data-font-scale", settings.fontScale);
                root.setAttribute("data-reduce-motion", String(settings.reduceMotion));
                root.setAttribute("data-high-contrast", String(settings.highContrast));
                if (resolved === "dark") root.classList.add("dark");
                else root.classList.remove("dark");
              } catch (e) {
                var root = document.documentElement;
                root.setAttribute("data-theme", "light");
                root.setAttribute("data-accent", "amber");
                root.setAttribute("data-font-scale", "md");
                root.setAttribute("data-reduce-motion", "false");
                root.setAttribute("data-high-contrast", "false");
                root.classList.remove("dark");
              }
            })();
          `}
        </Script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Inter — UI body text (Vercel, Linear, Notion standard) */}
        {/* Space Grotesk — display headings (geometric, high-tech feel) */}
        {/* Space Mono — monospace elements */}
        {/* VT323 & Share Tech Mono — MISSI LED logo */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&family=VT323&family=Share+Tech+Mono&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <Script id="service-worker-registration">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(function(registration) {
                  console.log('SW registered: ', registration.scope);
                }, function(err) {
                  console.log('SW registration failed: ', err);
                });
              });
            }
          `}
        </Script>
        <Providers>
          <SmoothScrollProvider>
            <CustomCursor />
            <MissiBuddyContainer />
            <div className="min-h-screen flex flex-col">
              <div className="flex-1">{children}</div>
            <footer
              className="relative px-6 md:px-10 py-6"
              style={{ borderTop: "1px solid var(--missi-border)" }}
              data-testid="global-footer"
            >
              <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
                <span
                  className="text-[11px] font-light"
                  style={{ color: "var(--missi-text-muted)" }}
                >
                  &copy; {new Date().getFullYear()} missiAI
                </span>
                <div className="flex items-center gap-5">
                  <Link
                    href="/privacy"
                    className="text-[11px] font-light transition-colors"
                    style={{ color: "var(--missi-text-muted)" }}
                    data-testid="footer-privacy-link"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    href="/terms"
                    className="text-[11px] font-light transition-colors"
                    style={{ color: "var(--missi-text-muted)" }}
                    data-testid="footer-terms-link"
                  >
                    Terms of Service
                  </Link>
                  <a
                    href="https://github.com/rudrasatani13/missiAI"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-light transition-colors"
                    style={{ color: "var(--missi-text-muted)" }}
                    data-testid="footer-github-link"
                  >
                    GitHub
                  </a>
                </div>
              </div>
            </footer>
          </div>
          </SmoothScrollProvider>
        </Providers>
        <Toaster
          position="bottom-right"
        />
      </body>
    </html>
  );
}
