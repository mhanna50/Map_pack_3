import "./globals.css";
import type { Metadata } from "next";

import { StructuredData } from "@/components/marketing/StructuredData";
import { brand } from "@/content/marketing";
import { createMarketingMetadata, getSiteUrl, organizationSchema, websiteSchema } from "@/lib/seo";

export const metadata: Metadata = {
  ...createMarketingMetadata({
    title: `${brand.name} | AI-assisted local visibility software`,
    description:
      "Visora helps local businesses improve Google visibility, manage reviews, clean up listings, recover missed leads, and understand what to fix next.",
    path: "/",
    keywords: [
      "local SEO software",
      "Google Business Profile management",
      "local visibility platform",
      "review management for local businesses",
    ],
  }),
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${brand.name} | AI-assisted local visibility software`,
    template: `%s | ${brand.name}`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StructuredData data={[organizationSchema(), websiteSchema()]} />
        {children}
      </body>
    </html>
  );
}
