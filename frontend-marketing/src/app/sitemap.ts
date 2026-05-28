import type { MetadataRoute } from "next";

import { learnPages, servicePages } from "@/content/marketing";
import { getSiteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();
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
  ];

  const serviceRoutes = servicePages.map((page) => `/services/${page.slug}`);
  const learnRoutes = learnPages.map((page) => `/learn/${page.slug}`);

  return [...staticRoutes, ...serviceRoutes, ...learnRoutes].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}
