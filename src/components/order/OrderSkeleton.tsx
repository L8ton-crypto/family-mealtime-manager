/**
 * Shown in place of the receipt while the order is still loading — QA
 * (second pass): `/order` used to render the REAL receipt shell with the
 * empty summary ("0/0 LINES TICKED", no lines) for a moment before the
 * first fetch resolved, which read as "this order genuinely has nothing in
 * it" rather than "still loading". "No spinners; use skeleton tickets" per
 * docs/VISION.md — a few shimmering mono bars inside the same perforated/
 * torn receipt shell, reduced-motion safe via the shared `.rk-skeleton`
 * shimmer (see SkeletonTicket.tsx / globals.css).
 */
export function OrderSkeleton() {
  const lineWidths = ['w-2/3', 'w-1/2', 'w-3/4', 'w-1/3', 'w-3/5', 'w-2/5'];
  return (
    <div className="rk-receipt" aria-hidden="true">
      <div className="rk-receipt__paper flex flex-col gap-4 px-5 pb-4 pt-4">
        <div className="flex flex-col items-center gap-2">
          <div className="rk-skeleton h-5 w-2/3 rounded-full bg-steel/40" />
          <div className="rk-skeleton h-3 w-1/3 rounded-full bg-steel/30" />
          <div className="rk-skeleton h-3 w-1/2 rounded-full bg-steel/30" />
        </div>
        <div className="rk-receipt__dashed" />
        <div className="rk-skeleton h-1.5 w-full rounded-full bg-steel/30" />
        <div className="flex flex-col gap-3">
          {lineWidths.map((width, i) => (
            <div key={i} className={`rk-skeleton h-3.5 ${width} rounded-full bg-steel/30`} />
          ))}
        </div>
      </div>
      <div className="rk-receipt__torn" />
    </div>
  );
}
