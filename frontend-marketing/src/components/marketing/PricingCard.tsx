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
        "flex h-full flex-col rounded-lg border bg-[#FFFDF8] p-6 shadow-[0_12px_32px_rgba(55,48,40,0.08)]",
        plan.featured ? "border-[#B86B4B] ring-2 ring-[#B86B4B]/20" : "border-[#D8CFC1]",
      )}
    >
      {plan.featured ? (
        <p className="mb-4 w-fit rounded-full bg-[#14213D] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#F8F3EA]">
          Most popular
        </p>
      ) : null}
      <h3 className="text-2xl font-semibold text-[#14213D]">{plan.name}</h3>
      <p className="mt-2 text-3xl font-semibold text-[#B86B4B]">{plan.price}</p>
      <p className="mt-3 text-sm leading-6 text-[#5F6673]">{plan.description}</p>
      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm leading-6 text-[#5F6673]">
            <Check className="mt-1 h-4 w-4 shrink-0 text-[#7A8463]" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/contact"
        className={cn(
          "mt-7 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#B86B4B]",
          plan.featured
            ? "bg-[#B86B4B] text-white hover:bg-[#A75F43]"
            : "border border-[#D8CFC1] text-[#14213D] hover:border-[#B86B4B]",
        )}
      >
        {plan.cta}
      </Link>
    </div>
  );
}

