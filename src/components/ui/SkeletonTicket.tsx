/**
 * A paper-coloured shimmer block shown in place of a ghost "+ Fire
 * something" slot while a week's plan entries are still loading — "no
 * spinners; use skeleton tickets" per docs/VISION.md. Reduced-motion safe:
 * the shimmer sweep is disabled (falls back to a static block) under
 * `prefers-reduced-motion: reduce`, same as every other rk- animation.
 */
export function SkeletonTicket() {
  return (
    <div className="rk-skeleton flex min-h-[48px] w-full flex-col gap-2 rounded-sm border border-steel p-3" aria-hidden="true">
      <div className="h-2.5 w-1/3 rounded-full bg-steel/50" />
      <div className="h-4 w-2/3 rounded-full bg-steel/40" />
    </div>
  );
}
