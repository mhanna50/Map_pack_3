import Link from "next/link";
import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { RetroBadge } from "@/components/marketing/RetroBadge";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  title: "Page Not Found | Visora",
  description: "The page you are looking for is not available. Return to Visora or contact support.",
  path: "/404",
  noIndex: true,
});

export default function NotFound() {
  return (
    <MarketingShell>
      <section className="px-6 pb-20 pt-36">
        <div className="mx-auto max-w-3xl text-center">
          <RetroBadge>404</RetroBadge>
          <h1 className="mt-6 text-balance text-5xl font-semibold text-[#14213D] md:text-7xl">
            This page wandered off the map.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#5F6673]">
            The page you are looking for is not here. Head back home or tell us what you were trying
            to find.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-full bg-[#B86B4B] px-6 py-3 text-sm font-semibold text-white hover:bg-[#A75F43]"
            >
              Back home
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-[#D8CFC1] bg-[#FFFDF8] px-6 py-3 text-sm font-semibold text-[#14213D] hover:border-[#B86B4B]"
            >
              Contact / Book Demo
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
