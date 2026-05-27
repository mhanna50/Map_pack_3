import type { Metadata } from "next";
import { Check } from "lucide-react";

import { ComparisonTable } from "@/components/marketing/ComparisonTable";
import { CTASection } from "@/components/marketing/CTASection";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { TrustCard } from "@/components/marketing/TrustCard";
import { outcomeFramework } from "@/content/marketing";

export const metadata: Metadata = {
  title: "One platform for local visibility, reputation, listings, and lead recovery",
  description:
    "See how Visora combines Google Business Profile work, reviews, citations, rank tracking, website checks, competitor monitoring, reporting, and lead recovery in one dashboard.",
};

const modules = [
  { title: "Visibility", body: "Track the searches, towns, and competitors that matter to your business.", icon: "radar" },
  { title: "Reputation", body: "Request reviews, monitor feedback, and respond with care.", icon: "star" },
  { title: "Listings", body: "Find citation mismatches and keep business details consistent.", icon: "list" },
  { title: "Content", body: "Use AI-assisted drafts for posts, profile updates, and helpful Q&A.", icon: "edit" },
  { title: "Website health", body: "Check the site basics that support trust and conversion.", icon: "monitor" },
  { title: "Lead recovery", body: "Follow up with missed callers and summarize the opportunity.", icon: "phone" },
  { title: "Reporting", body: "See what was done, what changed, and what needs attention.", icon: "chart" },
  { title: "Competitors", body: "Understand nearby profiles without making it a distraction.", icon: "users" },
];

const onboarding = [
  "Connect or review your Google Business Profile.",
  "Confirm business details, services, locations, and contact preferences.",
  "Run the first audit across profile, reviews, citations, website, and lead follow-up.",
  "Prioritize the fixes that matter most for trust and local visibility.",
];

const dashboardItems = [
  "Profile gaps and suggested fixes",
  "Posts drafted, scheduled, or published",
  "New reviews and response status",
  "Citation mismatches and missing listings",
  "Keyword and competitor visibility movement",
  "Missed calls, lead intake, and owner alerts",
];

const automationItems = [
  "AI-assisted post drafts and Q&A suggestions",
  "Review request workflows",
  "Citation mismatch detection",
  "Photo and content prompts",
  "Missed call text-back where enabled",
  "Owner summaries and reporting",
];

const controlItems = [
  "Business voice and final approvals",
  "Sensitive review responses",
  "Phone forwarding and lead recovery settings",
  "Which integrations are connected",
  "Which recommendations to act on first",
];

export default function PlatformPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Platform"
        title="One platform for local visibility, reputation, listings, and lead recovery."
        description="Most businesses use scattered tools, spreadsheets, reminders, and manual follow-up. Visora brings the work into one calm dashboard that feels like a helpful business assistant."
      />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <ComparisonTable
            leftTitle="The old way"
            rightTitle="The new way"
            rows={[
              { left: "GBP posts in one tool, reviews in another, listings in another.", right: "One dashboard connects profile activity, reviews, listings, and reporting." },
              { left: "Spreadsheets and sticky notes for follow-up.", right: "Clear tasks, prompts, owner alerts, and lead summaries." },
              { left: "Manual reminders when someone remembers.", right: "Automations keep the important pieces moving." },
              { left: "Reports that explain activity but not priority.", right: "Plain-language context for what changed and what to fix next." },
            ]}
          />
        </div>
      </section>

      <section className="bg-[#f5e8d1] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Modules"
            title="Everything supports the same four outcomes."
            description="Get found, look trustworthy, stay consistent, and turn interest into leads."
            align="center"
          />
          <div className="mt-10">
            <FeatureGrid items={modules} />
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {outcomeFramework.map((item) => (
              <TrustCard key={item.title} title={item.title} body={item.body} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-3">
          <div>
            <SectionHeader
              eyebrow="Onboarding"
              title="What happens after setup starts."
              description="The platform starts with practical discovery, not a confusing audit dump."
            />
          </div>
          <div className="lg:col-span-2">
            <ol className="grid gap-4 md:grid-cols-2">
              {onboarding.map((item, index) => (
                <li key={item} className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-5">
                  <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8a4b31]">
                    {index + 1}
                  </span>
                  <p className="mt-3 text-sm leading-6 text-[#3f4a45]">{item}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="bg-[#fff8ec] px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {[
            { title: "What owners see", items: dashboardItems },
            { title: "What the platform automates", items: automationItems },
            { title: "What stays in your control", items: controlItems },
          ].map((group) => (
            <div key={group.title} className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6">
              <h2 className="text-xl font-semibold text-[#17202e]">{group.title}</h2>
              <ul className="mt-5 space-y-3">
                {group.items.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6 text-[#53605a]">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-[#6f7f49]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <CTASection />
    </MarketingShell>
  );
}

