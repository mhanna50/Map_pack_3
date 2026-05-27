import Link from "next/link";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function PricingCard({
  plan,
}: {
  plan: {
    name: string;
    price: string;
    description: string;
    features: string[];
    cta: string;
    featured?: boolean;
  };
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-lg border bg-[#fffaf0] p-6 shadow-[0_12px_32px_rgba(55,48,40,0.08)]",
        plan.featured ? "border-[#d86f45] ring-2 ring-[#d86f45]/20" : "border-[#dcc6a4]",
      )}
    >
      {plan.featured ? (
        <p className="mb-4 w-fit rounded-full bg-[#24465f] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#fff8ec]">
          Most popular
        </p>
      ) : null}
      <h3 className="text-2xl font-semibold text-[#17202e]">{plan.name}</h3>
      <p className="mt-2 text-3xl font-semibold text-[#8a4b31]">{plan.price}</p>
      <p className="mt-3 text-sm leading-6 text-[#5a665f]">{plan.description}</p>
      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm leading-6 text-[#3f4a45]">
            <Check className="mt-1 h-4 w-4 shrink-0 text-[#6f7f49]" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/contact"
        className={cn(
          "mt-7 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#d86f45]",
          plan.featured
            ? "bg-[#d86f45] text-white hover:bg-[#bf5f3b]"
            : "border border-[#c7ad84] text-[#17202e] hover:border-[#d86f45]",
        )}
      >
        {plan.cta}
      </Link>
    </div>
  );
}

