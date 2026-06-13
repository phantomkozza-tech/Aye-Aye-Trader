import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aye Aye Trader — Journal",
  description: "Futures trading journal for prop traders.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
