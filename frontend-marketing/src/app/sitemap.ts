import type { MetadataRoute } from "next";

import { learnPages, servicePages } from "@/content/marketing";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_MARKETING_SITE_URL ?? "https://www.usevisora.com").replace(/\/+$/, "");
  const staticRoutes = [
    "",
    "/platform",
    "/services",
    "/learn",
    "/pricing",
    "/about",
    "/faq",
    "/contact",
    "/privacy",
    "/terms",
    "/security",
    "/cookies",
    "/support",
    "/login",
  ];

  const serviceRoutes = servicePages.map((page) => `/services/${page.slug}`);
  const learnRoutes = learnPages.map((page) => `/learn/${page.slug}`);

  return [...staticRoutes, ...serviceRoutes, ...learnRoutes].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}

