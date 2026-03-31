import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";
import Link from "next/link";

export const metadata: Metadata = {
  title: "missiAI — AI with Memory",
  description:
    "Voice AI assistant that remembers you. Chat naturally in Hindi, English, or Hinglish.",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased bg-black text-white">
        <Providers>
          <div className="min-h-screen flex flex-col">
            <div className="flex-1">{children}</div>
            <footer
              className="relative px-6 md:px-10 py-6"
              style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
              data-testid="global-footer"
            >
              <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
                <span
                  className="text-[11px] font-light"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  &copy; {new Date().getFullYear()} missiAI
                </span>
                <div className="flex items-center gap-5">
                  <Link
                    href="/privacy"
                    className="text-[11px] font-light transition-colors hover:text-white/50"
                    style={{ color: "rgba(255,255,255,0.2)" }}
                    data-testid="footer-privacy-link"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    href="/terms"
                    className="text-[11px] font-light transition-colors hover:text-white/50"
                    style={{ color: "rgba(255,255,255,0.2)" }}
                    data-testid="footer-terms-link"
                  >
                    Terms of Service
                  </Link>
                  <a
                    href="https://github.com/rudrasatani13/missiAI"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-light transition-colors hover:text-white/50"
                    style={{ color: "rgba(255,255,255,0.2)" }}
                    data-testid="footer-github-link"
                  >
                    GitHub
                  </a>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(20, 20, 20, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              color: 'white',
            }
          }}
        />
      </body>
    </html>
  );
}