import type { Metadata } from "next";

import { CTASection } from "@/components/marketing/CTASection";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { ServiceCard } from "@/components/marketing/ServiceCard";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { servicePages } from "@/content/marketing";

export const metadata: Metadata = {
  title: "Local SEO services and platform modules",
  description:
    "Explore Visora modules for Google Business Profile management, posting, reviews, citations, rank tracking, competitor monitoring, website audits, Q&A, lead recovery, and reporting.",
};

export default function ServicesPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Services"
        title="Local visibility modules that work together."
        description="Each module solves a practical piece of the local search puzzle: getting found, looking trustworthy, staying consistent, and turning interest into leads."
      />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Overview"
            title="What Visora can help manage."
            description="Every card explains what the service is, why it matters, and what the platform does."
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {servicePages.map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        </div>
      </section>

      <CTASection />
    </MarketingShell>
  );
}

