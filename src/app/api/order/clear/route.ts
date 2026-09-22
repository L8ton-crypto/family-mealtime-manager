import { NextRequest, NextResponse } from 'next/server';
import { clearOrderSchema } from '@/lib/order-schema';
import { clearCheckedLines, fetchOrderSummary } from '@/lib/order-db';
import { startOfWeek } from '@/lib/dates';

// POST /api/order/clear { week, checkedOnly: true } — deletes ticked lines
// (manual and generated alike) for that week.
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = clearOrderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const weekStart = startOfWeek(parsed.data.week);
  await clearCheckedLines(weekStart);
  const summary = await fetchOrderSummary(weekStart);
  return NextResponse.json(summary);
}
