import Link from "next/link";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { RetroBadge } from "@/components/marketing/RetroBadge";

export default function NotFound() {
  return (
    <MarketingShell>
      <section className="px-6 pb-20 pt-36">
        <div className="mx-auto max-w-3xl text-center">
          <RetroBadge>404</RetroBadge>
          <h1 className="mt-6 text-balance text-5xl font-semibold text-[#17202e] md:text-7xl">
            This page wandered off the map.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#53605a]">
            The page you are looking for is not here. Head back home or tell us what you were trying
            to find.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-full bg-[#d86f45] px-6 py-3 text-sm font-semibold text-white hover:bg-[#bf5f3b]"
            >
              Back home
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-[#c7ad84] bg-[#fffaf0] px-6 py-3 text-sm font-semibold text-[#17202e] hover:border-[#d86f45]"
            >
              Contact / Book Demo
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

