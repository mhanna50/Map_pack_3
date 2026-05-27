import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { brand } from "@/content/marketing";

export const metadata: Metadata = {
  title: "Terms of Service draft",
  description:
    "A practical draft terms page for Visora covering platform use, accounts, subscriptions, no ranking guarantees, integrations, acceptable use, data accuracy, cancellation, and liability.",
};

const sections = [
  {
    title: "Important note",
    body: "This page is provided as a practical draft and should be reviewed by legal counsel before production use.",
  },
  {
    title: "Use of platform",
    body: "Visora provides tools for local visibility, reputation, listings, reporting, and lead recovery. Customers are responsible for using the platform lawfully and in line with connected service requirements.",
  },
  {
    title: "Account responsibilities",
    body: "Customers are responsible for accurate account information, protecting login credentials, assigning appropriate access, and notifying support about unauthorized use.",
  },
  {
    title: "Payments and subscriptions",
    body: "Paid plans may renew monthly or according to the customer agreement. Fees, billing dates, taxes, cancellation rules, and refunds should be defined in the order form or subscription checkout.",
  },
  {
    title: "No ranking guarantees",
    body: "Visora does not guarantee search rankings, review volume, lead volume, revenue, or specific placement in Google results. The platform helps improve signals, consistency, workflows, and visibility reporting.",
  },
  {
    title: "Third-party integrations",
    body: "Features may rely on Google, Twilio, Stripe, Supabase, hosting providers, and other services. Availability can depend on third-party APIs, permissions, outages, policy changes, and customer configuration.",
  },
  {
    title: "Acceptable use",
    body: "Customers may not use the platform for unlawful activity, spam, deceptive reviews, harassment, unauthorized data access, security testing without approval, or activity that violates third-party terms.",
  },
  {
    title: "Data accuracy",
    body: "Customers are responsible for the accuracy of business details, service descriptions, contact information, review response approvals, and any content submitted or approved through the platform.",
  },
  {
    title: "Limitation of liability placeholder",
    body: "Liability language should be reviewed and completed by legal counsel based on the company entity, jurisdiction, and commercial terms.",
  },
  {
    title: "Termination and cancellation",
    body: "Either party may have rights to cancel or terminate according to the applicable agreement. Data export, deletion, unpaid fees, and integration disconnection should be handled according to production policy.",
  },
  {
    title: "Contact",
    body: `Contact placeholder: ${brand.email}. Replace or confirm this address before production launch.`,
  },
];

export default function TermsPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Legal"
        title="Terms of Service draft."
        description="Practical draft terms for the Visora platform, subscriptions, integrations, acceptable use, and expectations."
      />
      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-4xl gap-5">
          {sections.map((section) => (
            <section key={section.title} className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6">
              <h2 className="text-xl font-semibold text-[#17202e]">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[#53605a]">{section.body}</p>
            </section>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}

