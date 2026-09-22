import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonTicket } from '@/components/ui/SkeletonTicket';

/** See docs/slices/05-service.md's Hardening scope. */
export default function TableLoading() {
  return (
    <div>
      <PageHeader kicker="LOADING THE TABLE" title="The Table" />
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonTicket key={i} />
        ))}
      </div>
    </div>
  );
}
