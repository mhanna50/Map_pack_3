import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { brand } from "@/content/marketing";

export const metadata: Metadata = {
  title: "Privacy Policy draft",
  description:
    "A practical draft privacy policy for Visora covering contact info, business data, Google data, reviews, listings, lead recovery metadata, providers, retention, and choices.",
};

const sections = [
  {
    title: "Important note",
    body: "This page is provided for transparency and should be reviewed by legal counsel before production use.",
  },
  {
    title: "Information collected",
    body: "We may collect contact information, business information, website and Google Business Profile data, reviews and listing data, lead recovery call or SMS metadata, dashboard usage data, and support communications.",
  },
  {
    title: "How information is used",
    body: "Information may be used to provide the service, improve local presence, send notifications, support customer requests, maintain security, troubleshoot issues, process payments, and improve platform reliability.",
  },
  {
    title: "Third-party services",
    body: "Depending on enabled features, Visora may use Google APIs, Twilio, Stripe, Supabase, hosting providers, analytics, logging, or email services to operate the platform.",
  },
  {
    title: "Data sharing",
    body: "We do not sell personal data. Information is shared only with service providers needed to operate the platform, comply with legal obligations, protect the service, or at the customer's direction.",
  },
  {
    title: "Data retention",
    body: "We retain information for as long as needed to provide the service, maintain records, resolve disputes, meet legal obligations, and support security. Retention periods may vary by data type and integration.",
  },
  {
    title: "Customer choices",
    body: "Customers can request access, correction, deletion, export, or disconnection of certain data, subject to account permissions, service requirements, legal obligations, and integration limitations.",
  },
  {
    title: "Contact",
    body: `Contact placeholder: ${brand.email}. Replace or confirm this address before production launch. Effective date placeholder: [Effective Date].`,
  },
];

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Legal"
        title="Privacy Policy draft."
        description="A practical privacy statement for how Visora may collect, use, and protect business and customer information."
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

