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
    <div className="overflow-hidden rounded-lg border border-[#dcc6a4] bg-[#fffaf0]">
      <div className="grid grid-cols-2 border-b border-[#dcc6a4] bg-[#f5e8d1] text-sm font-semibold text-[#17202e]">
        <div className="p-4">{leftTitle}</div>
        <div className="border-l border-[#dcc6a4] p-4">{rightTitle}</div>
      </div>
      {rows.map((row) => (
        <div key={row.left} className="grid grid-cols-2 border-b border-[#ead9bd] last:border-b-0">
          <div className="p-4 text-sm leading-6 text-[#6a5b4a]">{row.left}</div>
          <div className="border-l border-[#ead9bd] p-4 text-sm leading-6 text-[#35413c]">
            {row.right}
          </div>
        </div>
      ))}
    </div>
  );
}

