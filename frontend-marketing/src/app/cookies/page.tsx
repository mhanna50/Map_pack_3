import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Cookie Policy draft",
  description:
    "A practical draft cookie policy for Visora covering essential login/session cookies and optional analytics or performance tools where enabled.",
};

const sections = [
  {
    title: "Essential cookies",
    body: "Essential cookies or similar storage may be used for login, session management, security, and basic platform operation.",
  },
  {
    title: "Analytics and performance",
    body: "If analytics or performance tools are enabled, they may use cookies or similar technologies to understand site usage, diagnose issues, and improve the product.",
  },
  {
    title: "Third-party cookies",
    body: "Connected services such as authentication, payments, embedded scheduling, or analytics providers may set cookies according to their own policies.",
  },
  {
    title: "Customer choices",
    body: "Browser settings can usually block or delete cookies. Blocking essential cookies may affect login or platform functionality.",
  },
  {
    title: "Production review",
    body: "This draft should be reviewed before production use and updated based on the analytics, scheduling, authentication, and payment tools actually enabled.",
  },
];

export default function CookiesPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Legal"
        title="Cookie Policy draft."
        description="A simple explanation of essential cookies and optional analytics or performance cookies where enabled."
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

