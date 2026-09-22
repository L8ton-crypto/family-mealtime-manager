import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonTicket } from '@/components/ui/SkeletonTicket';

/** See docs/slices/05-service.md's Hardening scope. */
export default function PassHistoryLoading() {
  return (
    <div>
      <PageHeader kicker="PAST SERVICES" title="History" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonTicket key={i} />
        ))}
      </div>
    </div>
  );
}
