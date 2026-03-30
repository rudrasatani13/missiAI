import type { Metadata } from "next";
import "./globals.css";

export const runtime = "edge";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Toaster } from "@/components/ui/sonner"; // 👈 Toaster import karein

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
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        </head>
        <body className="font-sans antialiased bg-black text-white">
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