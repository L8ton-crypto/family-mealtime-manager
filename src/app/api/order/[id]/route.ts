import { NextRequest, NextResponse } from 'next/server';
import { patchOrderItemSchema } from '@/lib/order-schema';
import { deleteOrderItem, patchOrderItem } from '@/lib/order-db';

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// PATCH /api/order/[id] { checked?, name?, quantity?, unit?, aisle? } — see
// order-db.ts's patchOrderItem doc comment for the manual-conversion rule.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'Invalid id' }] }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchOrderItemSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }

  const updated = await patchOrderItem(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'Invalid id' }] }, { status: 400 });
  }
  const deleted = await deleteOrderItem(id);
  if (!deleted) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
