import "./globals.css";
import type { Metadata } from "next";

import { brand } from "@/content/marketing";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_MARKETING_SITE_URL ?? "https://www.usevisora.com"),
  title: {
    default: `${brand.name} | AI-assisted local visibility software`,
    template: `%s | ${brand.name}`,
  },
  description:
    "Visora helps local businesses improve Google visibility, manage reviews, clean up listings, recover missed leads, and understand what to fix next.",
  openGraph: {
    title: `${brand.name} | AI-assisted local visibility software`,
    description:
      "One platform for local visibility, reputation, listings, website checks, and lead recovery.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
