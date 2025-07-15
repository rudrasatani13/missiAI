import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'missiAI',
  description: 'The Next Gen AI Assistant',
  generator: 'missiAI Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="google-adsense-account" content="ca-pub-8166479565252115" />
      </head>
      <body>{children}</body>
    </html>
  );
}