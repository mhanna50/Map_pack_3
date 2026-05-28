import { RetroBadge } from "@/components/marketing/RetroBadge";
import { cn } from "@/lib/utils";

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-4",
        align === "center" && "mx-auto max-w-3xl text-center",
        className,
      )}
    >
      {eyebrow ? <RetroBadge>{eyebrow}</RetroBadge> : null}
      <h2 className="text-balance text-3xl font-semibold leading-tight text-[#14213D] md:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="text-pretty text-base leading-7 text-[#5F6673] md:text-lg">{description}</p>
      ) : null}
    </div>
  );
}

