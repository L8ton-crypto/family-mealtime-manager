import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonTicket } from '@/components/ui/SkeletonTicket';

// The Pass's own loading boundary — also the fallback for any nested (app)
// route that doesn't define its own loading.tsx. Skeleton tickets, not a
// spinner, per docs/VISION.md. See docs/slices/05-service.md's Hardening
// scope ("loading.tsx per route group with skeleton tickets").
export default function PassLoading() {
  return (
    <div>
      <PageHeader kicker="LOADING SERVICE" title="The Pass" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <SkeletonTicket />
            <SkeletonTicket />
          </div>
        ))}
      </div>
    </div>
  );
}
