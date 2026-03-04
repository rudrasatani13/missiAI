import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Toaster } from "@/components/ui/sonner"; // 👈 Toaster import karein

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "missiAI | The Future of Human-AI Interaction",
  description: "The most powerful human AI assistant yet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
      }}
    >
      <html lang="en" className="dark">
        <body className={`${inter.variable} font-sans antialiased bg-black text-white`}>
          {children}

          {/* 👈 Yeh Toaster app me kahin bhi popup dikhane ka kaam karega */}
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
    </ClerkProvider>
  );
}