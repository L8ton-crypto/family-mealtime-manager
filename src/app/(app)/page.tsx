import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PassView } from '@/components/pass/PassView';

// PassView reads the week in view from useSearchParams, which Next 16
// requires to be wrapped in Suspense.
export default function PassPage() {
  return (
    <Suspense fallback={<PageHeader kicker="LOADING SERVICE" title="The Pass" />}>
      <PassView />
    </Suspense>
  );
}
