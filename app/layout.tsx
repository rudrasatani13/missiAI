import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { Inter } from "next/font/google"
import { Dancing_Script } from "next/font/google"
import Script from "next/script"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
})
const dancingScript = Dancing_Script({
  variable: "--font-dancing-script",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "missiAI - AI with Memory",
  description: "Help your AI remember the right stuff. Context-aware AI platform.",
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${dancingScript.variable} font-inter`}>
        {children}

        {/* Logo Protection Script */}
        <Script id="logo-protection" strategy="afterInteractive">
          {`
            // Disable right-click context menu on logo images
            document.addEventListener('contextmenu', function(e) {
              if (e.target.tagName === 'IMG' && (
                e.target.src.includes('logo') || 
                e.target.src.includes('missiai') ||
                e.target.alt.toLowerCase().includes('logo') ||
                e.target.alt.toLowerCase().includes('missiai')
              )) {
                e.preventDefault();
                return false;
              }
            });

            // Disable drag and drop for logo images
            document.addEventListener('dragstart', function(e) {
              if (e.target.tagName === 'IMG' && (
                e.target.src.includes('logo') || 
                e.target.src.includes('missiai') ||
                e.target.alt.toLowerCase().includes('logo') ||
                e.target.alt.toLowerCase().includes('missiai')
              )) {
                e.preventDefault();
                return false;
              }
            });

            // Disable keyboard shortcuts for saving images
            document.addEventListener('keydown', function(e) {
              // Disable Ctrl+S, Ctrl+A, F12, Ctrl+Shift+I, Ctrl+U
              if ((e.ctrlKey && (e.key === 's' || e.key === 'a' || e.key === 'u')) || 
                  e.key === 'F12' || 
                  (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                e.preventDefault();
                return false;
              }
            });

            // Disable text selection on logo containers
            const logoContainers = document.querySelectorAll('[class*="logo"], [alt*="logo"], [alt*="missiai"]');
            logoContainers.forEach(function(container) {
              container.style.webkitUserSelect = 'none';
              container.style.mozUserSelect = 'none';
              container.style.msUserSelect = 'none';
              container.style.userSelect = 'none';
            });
          `}
        </Script>
      </body>
    </html>
  )
}
