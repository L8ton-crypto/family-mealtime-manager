import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';

const bodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

/**
 * Sets sort_order for every member in one request, in one transaction —
 * `ids[0]` becomes sort_order 0, `ids[1]` becomes 1, etc. The full member
 * list must be provided; `ids` must be exactly the set of existing member
 * ids (no more, no fewer, no duplicates), or the request is rejected with
 * 400 rather than silently reordering a subset.
 */
export async function PUT(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }

  const { ids } = parsed.data;

  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    return NextResponse.json(
      { error: 'validation', issues: [{ message: 'ids must not contain duplicates' }] },
      { status: 400 }
    );
  }

  const existingRows = await sql`SELECT id FROM fm_members`;
  const existingIds = new Set(existingRows.map((row) => row.id as number));

  const idsMatchExactly =
    existingIds.size === uniqueIds.size && ids.every((id) => existingIds.has(id));

  if (!idsMatchExactly) {
    return NextResponse.json(
      { error: 'validation', issues: [{ message: 'ids must exactly match the current set of members' }] },
      { status: 400 }
    );
  }

  await sql.transaction((txn) =>
    ids.map((id, index) => txn.query('UPDATE fm_members SET sort_order = $1 WHERE id = $2', [index, id]))
  );

  const members = await sql`
    SELECT id, name, age_group, colour, likes, dislikes, restrictions, allergies, sort_order, created_at
    FROM fm_members
    ORDER BY sort_order ASC, id ASC
  `;

  return NextResponse.json(members);
}
