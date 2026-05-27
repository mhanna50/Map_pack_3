import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { TrustCard } from "@/components/marketing/TrustCard";

export const metadata: Metadata = {
  title: "Security and data handling",
  description:
    "How Visora is designed to handle business data, permissions, tenant scoping, integrations, automations, and customer control.",
};

export default function SecurityPage() {
  return (
    <MarketingShell>
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

