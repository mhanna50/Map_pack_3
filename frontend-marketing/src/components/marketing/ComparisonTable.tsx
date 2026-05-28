export function ComparisonTable({
  leftTitle,
  rightTitle,
  rows,
}: {
  leftTitle: string;
  rightTitle: string;
  rows: { left: string; right: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#D8CFC1] bg-[#FFFDF8]">
      <div className="grid border-b border-[#D8CFC1] bg-[#F8F3EA] text-sm font-semibold text-[#14213D] sm:grid-cols-2">
        <div className="p-4">{leftTitle}</div>
        <div className="border-t border-[#D8CFC1] p-4 sm:border-l sm:border-t-0">{rightTitle}</div>
      </div>
      {rows.map((row) => (
        <div key={row.left} className="grid border-b border-[#D8CFC1] last:border-b-0 sm:grid-cols-2">
          <div className="p-4 text-sm leading-6 text-[#5F6673]">{row.left}</div>
          <div className="border-t border-[#D8CFC1] p-4 text-sm leading-6 text-[#14213D] sm:border-l sm:border-t-0">
            {row.right}
          </div>
        </div>
      ))}
    </div>
  );
}
