export function BeamCanvas() {
  return (
    <div
      aria-hidden
      className="h-full w-full"
      style={{
        background:
          "radial-gradient(60% 60% at 60% 40%, rgba(56,189,248,0.35), rgba(2,6,23,0) 70%), linear-gradient(180deg, rgba(30,58,138,0.25), rgba(2,6,23,0))",
        opacity: 0.9,
      }}
    />
  );
}
