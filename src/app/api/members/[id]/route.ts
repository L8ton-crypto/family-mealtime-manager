import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { patchMemberSchema } from '@/lib/members-schema';

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'Invalid id' }] }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchMemberSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }

  const { name, age_group, colour, likes, dislikes, restrictions, allergies, sort_order } = parsed.data;

  const [member] = await sql`
    UPDATE fm_members SET
      name = COALESCE(${name ?? null}, name),
      age_group = COALESCE(${age_group ?? null}, age_group),
      colour = COALESCE(${colour ?? null}, colour),
      likes = COALESCE(${likes ? JSON.stringify(likes) : null}::jsonb, likes),
      dislikes = COALESCE(${dislikes ? JSON.stringify(dislikes) : null}::jsonb, dislikes),
      restrictions = COALESCE(${restrictions ? JSON.stringify(restrictions) : null}::jsonb, restrictions),
      allergies = COALESCE(${allergies ? JSON.stringify(allergies) : null}::jsonb, allergies),
      sort_order = COALESCE(${sort_order ?? null}, sort_order)
    WHERE id = ${id}
    RETURNING id, name, age_group, colour, likes, dislikes, restrictions, allergies, sort_order, created_at
  `;

  if (!member) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(member);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'Invalid id' }] }, { status: 400 });
  }

  const [deleted] = await sql`DELETE FROM fm_members WHERE id = ${id} RETURNING id`;
  if (!deleted) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
