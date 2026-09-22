import { NextRequest, NextResponse } from 'next/server';
import { generateOrderSchema } from '@/lib/order-schema';
import { fetchAggregateEntriesForWeek, fetchOrderItems, fetchOrderSummary, regenerateGeneratedLines } from '@/lib/order-db';
import { aggregate } from '@/lib/order';
import { startOfWeek } from '@/lib/dates';

// POST /api/order/generate { week } — rebuilds generated lines from this
// week's planned pass entries: deletes generated lines no longer present,
// upserts the rest preserving `checked`, leaves manual lines untouched
// entirely. See docs/slices/04-order.md.
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = generateOrderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const weekStart = startOfWeek(parsed.data.week);

  const [entries, existingItems] = await Promise.all([
    fetchAggregateEntriesForWeek(weekStart),
    fetchOrderItems(weekStart),
  ]);

  const lines = aggregate(
    entries,
    existingItems.map((i) => ({
      key: i.key,
      checked: i.checked,
      overridden: i.overridden,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      aisle: i.aisle,
    }))
  );

  await regenerateGeneratedLines(weekStart, lines);

  const summary = await fetchOrderSummary(weekStart);
  return NextResponse.json(summary);
}
