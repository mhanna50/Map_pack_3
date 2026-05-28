import { MarketingIcon } from "@/components/marketing/icons";

export function FeatureGrid({
  items,
}: {
  items: { title: string; body: string; icon?: string }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-5 shadow-[0_10px_30px_rgba(55,48,40,0.07)]"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#14213D] text-[#F8F3EA]">
            <MarketingIcon name={item.icon ?? "map"} className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold text-[#14213D]">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#5F6673]">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

