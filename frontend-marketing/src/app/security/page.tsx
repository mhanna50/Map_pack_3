import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { StructuredData } from "@/components/marketing/StructuredData";
import { TrustCard } from "@/components/marketing/TrustCard";
import { breadcrumbSchema, createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  title: "Visora Security and Data Handling | Visora",
  description:
    "How Visora is designed to handle local business data, permissions, tenant scoping, integrations, automations, and customer control.",
  path: "/security",
  keywords: ["Visora security", "local SEO platform data security"],
});

export default function SecurityPage() {
  return (
    <MarketingShell>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Security", path: "/security" },
        ])}
      />
      <PageHero
        eyebrow="Trust"
        title="Security and data handling, explained plainly."
        description="Local visibility software touches business profiles, reviews, listings, and sometimes lead follow-up. This page explains the design intent without making unsupported promises."
      />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Design approach"
            title="We design the platform to keep business data scoped, purposeful, and controlled."
            description="Where enabled, integrations require permissions, admin access is controlled, and automations are monitored so business owners can see what is connected."
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <TrustCard
              title="Permission-based integrations"
              body="Connections such as Google or Twilio require authorization. The business controls what is connected."
            />
            <TrustCard
              title="Scoped business data"
              body="The platform is designed so business data is scoped to the correct account, tenant, or location where those features are enabled."
            />
            <TrustCard
              title="Controlled admin access"
              body="Admin tools should be limited to authorized users and used for support, operations, and customer service."
            />
            <TrustCard
              title="Monitored automations"
              body="Webhooks and automations should be monitored so review, posting, citation, and lead recovery workflows can be supported."
            />
            <TrustCard
              title="No selling customer data"
              body="The platform is designed to use data to provide the service, not to sell customer or lead data."
            />
            <TrustCard
              title="Owner visibility"
              body="Business owners should be able to understand what data is connected and what workflows are active."
            />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
