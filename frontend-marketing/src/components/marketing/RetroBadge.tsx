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
        "inline-flex w-fit items-center gap-2 rounded-full border border-[#d8b56d]/60 bg-[#fff7df] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#7b3f2a] shadow-[0_2px_0_rgba(41,35,28,0.08)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

