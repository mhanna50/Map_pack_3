import { cn } from "@/lib/utils";

export function RetroBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full border border-[#E6C98F]/60 bg-[#fff7df] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#B86B4B] shadow-[0_2px_0_rgba(41,35,28,0.08)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

