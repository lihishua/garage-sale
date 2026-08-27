import type { Metadata, Viewport } from "next";
import "./globals.css";

// all four files are generated from garage-sale-icon.png — see README
export const metadata: Metadata = {
  // without metadataBase every relative URL in a share preview resolves
  // against localhost, so it has to be the real domain
  metadataBase: new URL("https://garagesale-online.com"),
  title: "Garage Sale",
  description: "מכירת חצר בקישור אחד",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/apple-touch-icon-180.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  themeColor: "#F7BC45",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
