import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/Providers";
import "./globals.css";

const switzer = localFont({
  src: [
    { path: "../fonts/switzer-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/switzer-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-switzer",
  display: "swap",
});

const geistMono = localFont({
  src: "../fonts/GeistMono-Regular.woff2",
  weight: "400",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Onchain — Tatas Handharu",
  description: "Connect MetaMask and see your assets across Ethereum, Base, Arbitrum, Polygon and BNB Chain.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${switzer.variable} ${geistMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
