import type { Metadata } from "next";

import { brand, type FAQItem, type LearnPage, type ServicePage } from "@/content/marketing";

const DEFAULT_SITE_URL = "https://www.usevisora.com";
const DEFAULT_OG_IMAGE = "/flow.svg";

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_MARKETING_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    DEFAULT_SITE_URL
  ).replace(/\/+$/, "");
}

export function absoluteUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalizedPath}`;
}

export function createMarketingMetadata({
  title,
  description,
  path,
  type = "website",
  noIndex = false,
  keywords,
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  noIndex?: boolean;
  keywords?: string[];
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title: {
      absolute: title,
    },
    description,
    keywords,
    alternates: {
      canonical: url,
    },
    robots: {
      index: !noIndex,
      follow: !noIndex,
      googleBot: {
        index: !noIndex,
        follow: !noIndex,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: brand.name,
      type,
      images: [
        {
          url: absoluteUrl(DEFAULT_OG_IMAGE),
          alt: "Visora local visibility platform dashboard flow",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(DEFAULT_OG_IMAGE)],
    },
  };
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${getSiteUrl()}/#organization`,
    name: brand.name,
    url: getSiteUrl(),
    email: brand.email,
    description:
      "Visora is an AI-assisted local visibility platform for local businesses that need help with Google Business Profile, reviews, listings, reporting, and lead recovery.",
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${getSiteUrl()}/#website`,
    name: brand.name,
    url: getSiteUrl(),
    publisher: {
      "@id": `${getSiteUrl()}/#organization`,
    },
  };
}

export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: brand.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: getSiteUrl(),
    description:
      "AI-assisted software for local business visibility, Google Business Profile management, reviews, listings, reporting, and lead recovery.",
    publisher: {
      "@id": `${getSiteUrl()}/#organization`,
    },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqSchema(items: FAQItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function serviceSchema(page: ServicePage) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.navLabel,
    serviceType: page.navLabel,
    url: absoluteUrl(`/services/${page.slug}`),
    description: page.excerpt,
    provider: {
      "@id": `${getSiteUrl()}/#organization`,
    },
    areaServed: {
      "@type": "Country",
      name: "United States",
    },
    audience: {
      "@type": "Audience",
      audienceType: "Local business owners and service businesses",
    },
  };
}

export function articleSchema(page: LearnPage) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.excerpt,
    url: absoluteUrl(`/learn/${page.slug}`),
    author: {
      "@id": `${getSiteUrl()}/#organization`,
    },
    publisher: {
      "@id": `${getSiteUrl()}/#organization`,
    },
  };
}

export function itemListSchema(items: { name: string; path: string; description?: string }[], name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(item.path),
      name: item.name,
      description: item.description,
    })),
  };
}
