import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LearnArticleLayout } from "@/components/marketing/LearnArticleLayout";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { getLearnPage, learnPages } from "@/content/marketing";

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

  return {
    title: page.metaTitle,
    description: page.metaDescription,
  };
}

export default async function LearnDetailPage({ params }: DynamicPageProps) {
  const { slug } = await params;
  const page = getLearnPage(slug);
  if (!page) notFound();

  return (
    <MarketingShell>
      <LearnArticleLayout page={page} />
    </MarketingShell>
  );
}
