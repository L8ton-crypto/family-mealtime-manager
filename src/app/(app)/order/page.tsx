import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { OrderView } from '@/components/order/OrderView';

// OrderView reads the week in view from useSearchParams, which Next 16
// requires to be wrapped in Suspense — same pattern as The Pass.
export default function OrderPage() {
  return (
    <Suspense fallback={<PageHeader kicker="SUPPLIER ORDER" title="The Order" />}>
      <OrderView />
    </Suspense>
  );
}
