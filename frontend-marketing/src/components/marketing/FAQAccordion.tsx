import type { FAQItem } from "@/content/marketing";

export function FAQAccordion({ items }: { items: FAQItem[] }) {
  return (
    <div className="divide-y divide-[#dec9a8] overflow-hidden rounded-lg border border-[#dec9a8] bg-[#fffaf0]">
      {items.map((item) => (
        <details key={item.question} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-5 py-4 text-left text-base font-semibold text-[#17202e] marker:hidden [&::-webkit-details-marker]:hidden">
            {item.question}
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#d8b56d] text-[#8a4b31] transition group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="px-5 pb-5 text-sm leading-6 text-[#5a665f]">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}

