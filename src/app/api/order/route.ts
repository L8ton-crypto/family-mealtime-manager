import { NextRequest, NextResponse } from 'next/server';
import { createManualLineSchema } from '@/lib/order-schema';
import { fetchOrderSummary, insertManualLine } from '@/lib/order-db';
import { isValidISODate, startOfWeek } from '@/lib/dates';

// GET /api/order?week= — items for that week (normalised to its Monday,
// same "any day within the week works" convention as POST /api/plan/fill),
// plus { total, checked, generatedAt }.
export async function GET(req: NextRequest) {
  const week = req.nextUrl.searchParams.get('week');
  if (!week || !isValidISODate(week)) {
    return NextResponse.json(
      { error: 'validation', issues: [{ message: 'week is required, as a real YYYY-MM-DD calendar date' }] },
      { status: 400 }
    );
  }
  const summary = await fetchOrderSummary(startOfWeek(week));
  return NextResponse.json(summary);
}

// POST /api/order — a manual line.
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = createManualLineSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const { week, ...rest } = parsed.data;
  const item = await insertManualLine(startOfWeek(week), { week, ...rest });
  return NextResponse.json(item, { status: 201 });
}
