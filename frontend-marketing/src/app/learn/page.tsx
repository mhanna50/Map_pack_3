import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CTASection } from "@/components/marketing/CTASection";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { StructuredData } from "@/components/marketing/StructuredData";
import { learnPages } from "@/content/marketing";
import { breadcrumbSchema, createMarketingMetadata, itemListSchema } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  title: "Local SEO Guides for Business Owners | Visora",
  description:
    "Learn local SEO in plain language with guides to Google Business Profile, Map Pack, reviews, citations, service SEO, and lead recovery.",
  path: "/learn",
  keywords: ["local SEO guides", "local SEO resources", "learn local SEO"],
});

export default function LearnPage() {
  return (
    <MarketingShell>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Learn", path: "/learn" },
          ]),
          itemListSchema(
            learnPages.map((page) => ({
              name: page.navLabel,
              path: `/learn/${page.slug}`,
              description: page.excerpt,
            })),
            "Visora local SEO learning resources",
          ),
        ]}
      />
      <PageHero
        eyebrow="Learn"
        title="Local SEO guides for business owners, explained without the alphabet soup."
        description="These pages are written for local business owners who want to know what matters, why it matters, and what to improve first."
      />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Guides"
            title="Helpful reading before you buy anything."
            description="Local SEO is easier to manage when the pieces are named clearly."
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {learnPages.map((page) => (
              <Link
                key={page.slug}
                href={`/learn/${page.slug}`}
                className="group flex h-full flex-col rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-5 shadow-[0_10px_30px_rgba(55,48,40,0.07)] transition hover:-translate-y-0.5 hover:border-[#B86B4B]"
              >
                <h2 className="text-xl font-semibold leading-snug text-[#14213D]">{page.navLabel}</h2>
                <p className="mt-3 flex-1 text-sm leading-6 text-[#5F6673]">{page.excerpt}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#B86B4B] group-hover:text-[#B86B4B]">
                  Read guide
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title="Want the platform to keep these basics moving?"
        description="Visora turns the checklist into audits, prompts, workflows, and reporting."
      />
    </MarketingShell>
  );
}
