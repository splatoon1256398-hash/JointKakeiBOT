import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "共同家計簿",
  description: "AIを活用した共同家計簿アプリ",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
