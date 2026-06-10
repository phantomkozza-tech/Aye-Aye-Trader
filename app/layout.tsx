import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aye Aye Trader — Journal",
  description: "Futures trading journal for prop traders.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
