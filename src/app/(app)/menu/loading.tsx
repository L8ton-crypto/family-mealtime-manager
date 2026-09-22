import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonTicket } from '@/components/ui/SkeletonTicket';

/** See docs/slices/05-service.md's Hardening scope. */
export default function MenuLoading() {
  return (
    <div>
      <PageHeader kicker="LOADING THE MENU" title="The Menu" />
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonTicket key={i} />
        ))}
      </div>
    </div>
  );
}
