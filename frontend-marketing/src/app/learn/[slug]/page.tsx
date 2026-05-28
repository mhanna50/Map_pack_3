import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LearnArticleLayout } from "@/components/marketing/LearnArticleLayout";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { StructuredData } from "@/components/marketing/StructuredData";
import { getLearnFaqs, getLearnPage, learnPages } from "@/content/marketing";
import { articleSchema, breadcrumbSchema, createMarketingMetadata, faqSchema } from "@/lib/seo";

export function generateStaticParams() {
  return learnPages.map((page) => ({ slug: page.slug }));
}

type DynamicPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: DynamicPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getLearnPage(slug);
  if (!page) return {};

  return createMarketingMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/learn/${page.slug}`,
    type: "article",
    keywords: [page.navLabel, "local SEO guide", "local SEO for small businesses"],
  });
}

export default async function LearnDetailPage({ params }: DynamicPageProps) {
  const { slug } = await params;
  const page = getLearnPage(slug);
  if (!page) notFound();
  const faqs = getLearnFaqs(page.slug);

  return (
    <MarketingShell>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Learn", path: "/learn" },
            { name: page.navLabel, path: `/learn/${page.slug}` },
          ]),
          articleSchema(page),
          ...(faqs.length ? [faqSchema(faqs)] : []),
        ]}
      />
      <LearnArticleLayout page={page} />
    </MarketingShell>
  );
}
