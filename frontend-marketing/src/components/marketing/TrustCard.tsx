import { cn } from "@/lib/utils";

export function TrustCard({
  title,
  body,
  className,
}: {
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-5 shadow-[0_10px_30px_rgba(55,48,40,0.08)]",
        className,
      )}
    >
      <h3 className="text-lg font-semibold text-[#14213D]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#5F6673]">{body}</p>
    </div>
  );
}

