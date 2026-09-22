import { PageHeader } from '@/components/ui/PageHeader';
import { OrderSkeleton } from '@/components/order/OrderSkeleton';

/** See docs/slices/05-service.md's Hardening scope. Reuses the same OrderSkeleton OrderView itself shows while useOrder/usePlan are loading (Slice 4 QA fix). */
export default function OrderLoading() {
  return (
    <div>
      <PageHeader kicker="SUPPLIER ORDER" title="The Order" />
      <OrderSkeleton />
    </div>
  );
}
