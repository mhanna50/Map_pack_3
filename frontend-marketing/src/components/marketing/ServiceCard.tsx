import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { MarketingIcon } from "@/components/marketing/icons";
import type { ServicePage } from "@/content/marketing";

export function ServiceCard({ service }: { service: ServicePage }) {
  return (
    <Link
      href={`/services/${service.slug}`}
      className="group flex h-full flex-col rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-5 shadow-[0_10px_30px_rgba(55,48,40,0.07)] transition hover:-translate-y-0.5 hover:border-[#B86B4B] hover:shadow-[0_16px_36px_rgba(55,48,40,0.12)] focus:outline-none focus:ring-2 focus:ring-[#B86B4B]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#14213D] text-[#F8F3EA]">
          <MarketingIcon name={service.icon} className="h-5 w-5" />
        </div>
        <ArrowRight
          className="mt-2 h-4 w-4 text-[#B86B4B] transition group-hover:translate-x-1"
          aria-hidden="true"
        />
      </div>
      <h3 className="mt-5 text-lg font-semibold leading-snug text-[#14213D]">{service.navLabel}</h3>
      <p className="mt-2 text-sm leading-6 text-[#5F6673]">{service.excerpt}</p>
    </Link>
  );
}

