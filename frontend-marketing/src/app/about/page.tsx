import type { Metadata } from "next";

import { CTASection } from "@/components/marketing/CTASection";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { StructuredData } from "@/components/marketing/StructuredData";
import { TrustCard } from "@/components/marketing/TrustCard";
import { breadcrumbSchema, createMarketingMetadata, organizationSchema } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  title: "About Visora | Visora",
  description:
    "Learn why Visora exists: practical, AI-assisted local SEO software for businesses that need clarity, consistency, and better follow-up.",
  path: "/about",
  keywords: ["about Visora", "local SEO platform for local businesses"],
});

export default function AboutPage() {
  return (
    <MarketingShell>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" },
          ]),
          organizationSchema(),
        ]}
      />
      <PageHero
        eyebrow="About"
        title="Built for real local businesses, not vague SEO promises."
        description="Visora exists to help business owners understand and improve their local presence without needing to become Google experts, review managers, citation cleaners, and missed-call follow-up teams all at once."
      />

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeader
            eyebrow="Founder-led thinking"
            title="Practical help beats mysterious reports."
            description="The best local visibility work is usually not glamorous. It is keeping the profile current, asking for reviews, fixing mismatched listings, watching competitors, checking the website, and following up when someone calls."
          />
          <div className="space-y-5 text-base leading-8 text-[#5F6673]">
            <p>
              Visora is designed around that reality. The platform uses AI where it can save time:
              drafting posts, summarizing leads, spotting profile gaps, shaping Q&A answers, and turning
              noisy data into next steps.
            </p>
            <p>
              It is still meant to feel human. Your business voice matters. Your policies matter. Your
              customer relationships matter. Automation should support those things, not flatten them.
            </p>
            <p>
              The goal is simple: help local businesses get found, look trustworthy, stay consistent, and
              avoid wasting the leads they already earned.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#F8F3EA] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="What we believe"
            title="Local SEO should be understandable."
            description="Business owners should be able to see what is happening, why it matters, and what needs attention."
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <TrustCard
              title="No ranking guarantees"
              body="Search results are influenced by many factors. We focus on improving the signals and consistency that matter."
            />
            <TrustCard
              title="No jargon gatekeeping"
              body="The platform explains GBP, citations, Map Pack visibility, reviews, and lead recovery in practical language."
            />
            <TrustCard
              title="No black box"
              body="AI-assisted work should be visible, reviewable, and connected to clear business outcomes."
            />
          </div>
        </div>
      </section>

      <CTASection />
    </MarketingShell>
  );
}
