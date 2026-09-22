import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { batchPlanEntrySchema } from '@/lib/plan-schema';
import { fetchAllMemberIds, fetchPlanEntryById } from '@/lib/plan-db';

// POST /api/plan/batch — commits a set of proposals (from POST
// /api/plan/fill, or any other caller) in one go: "Fire the week"'s sticky
// bar creates every draft ticket at once. See docs/slices/03-engine.md.
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = batchPlanEntrySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const { entries, replaceEntryIds } = parsed.data;
  const deleteIds = replaceEntryIds ?? [];

  // QA (Slice 3, second pass): only a `planned` entry can be replaced — a
  // plated or 86'd one is protected. fillWeek itself never offers those in
  // `replaces`, but the batch endpoint re-checks independently rather than
  // trusting the client's request body.
  if (deleteIds.length > 0) {
    const rows = await sql.query('SELECT id, status FROM fm_plan_entries WHERE id = ANY($1::int[])', [deleteIds]);
    const statusById = new Map((rows as { id: number; status: string }[]).map((r) => [r.id, r.status]));
    for (const id of deleteIds) {
      const status = statusById.get(id);
      if (status === undefined) {
        return NextResponse.json(
          { error: 'validation', issues: [{ message: `replaceEntryIds: entry ${id} does not exist` }] },
          { status: 400 }
        );
      }
      if (status !== 'planned') {
        return NextResponse.json(
          { error: 'validation', issues: [{ message: `replaceEntryIds: entry ${id} is not planned — only planned entries can be replaced` }] },
          { status: 400 }
        );
      }
    }
  }

  const recipeIds = Array.from(new Set(entries.map((e) => e.recipe_id)));
  const recipeRows = await sql.query('SELECT id, archived FROM fm_recipes WHERE id = ANY($1::int[])', [recipeIds]);
  const recipesById = new Map((recipeRows as { id: number; archived: boolean }[]).map((r) => [r.id, r]));
  for (const id of recipeIds) {
    const recipe = recipesById.get(id);
    if (!recipe) {
      return NextResponse.json(
        { error: 'validation', issues: [{ message: `recipe_id ${id} does not exist` }] },
        { status: 400 }
      );
    }
    if (recipe.archived) {
      return NextResponse.json({ error: 'validation', issues: [{ message: "dish is 86'd" }] }, { status: 400 });
    }
  }

  const allMemberIds = await fetchAllMemberIds();
  const allMemberIdSet = new Set(allMemberIds);
  const requestedAttendeeIds = Array.from(new Set(entries.flatMap((e) => e.attendees ?? [])));
  if (requestedAttendeeIds.some((id) => !allMemberIdSet.has(id))) {
    return NextResponse.json(
      { error: 'validation', issues: [{ message: 'One or more attendee ids do not exist' }] },
      { status: 400 }
    );
  }

  // Position is "append to the end of this (date, slot)'s current tickets",
  // same rule POST /api/plan uses for one entry — computed once per distinct
  // (date, slot) pair up front, then handed out sequentially to entries
  // destined for that pair, in the order they appear in the request.
  const pairKeys = Array.from(new Set(entries.map((e) => `${e.service_date}__${e.slot}`)));
  const nextPositionByPair = new Map<string, number>(
    await Promise.all(
      pairKeys.map(async (key) => {
        const [service_date, slot] = key.split('__');
        const [{ next }] = (await sql`
          SELECT COALESCE(MAX(position), -1) + 1 AS next
          FROM fm_plan_entries
          WHERE service_date = ${service_date} AND slot = ${slot}
        `) as { next: number }[];
        return [key, next] as const;
      })
    )
  );
  const positions = entries.map((e) => {
    const key = `${e.service_date}__${e.slot}`;
    const position = nextPositionByPair.get(key)!;
    nextPositionByPair.set(key, position + 1);
    return position;
  });

  // The replace-delete and the multi-row INSERT run together in ONE
  // sql.transaction() — QA (Slice 3, second pass) requires the delete to
  // happen "inside the same transaction" as the insert. This is safe even
  // though neon's sql.transaction() can't have one query in a batch read
  // another's RETURNING value: the delete and the insert are independent
  // statements (neither needs the other's result to run), so both can be
  // built and submitted together; only the CALLER (here) needs the insert's
  // ids afterwards, to attach attendees in a second transaction. Deleting
  // with an empty id array (`= ANY('{}')`) is a safe no-op, so the shape of
  // this transaction's result array is always [deleteResult, insertResult]
  // regardless of whether anything is actually being replaced.
  const valuesSql = entries.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ');
  const insertValues = entries.flatMap((e, i) => [e.service_date, e.slot, e.recipe_id, positions[i]]);
  const [, insertedRows] = await sql.transaction((txn) => [
    txn.query('DELETE FROM fm_plan_entries WHERE id = ANY($1::int[])', [deleteIds]),
    txn.query(`INSERT INTO fm_plan_entries (service_date, slot, recipe_id, position) VALUES ${valuesSql} RETURNING id`, insertValues),
  ]);
  const ids = (insertedRows as { id: number }[]).map((r) => r.id);

  try {
    const attendeeQueries: [number, number][] = [];
    entries.forEach((entry, i) => {
      const attendees = entry.attendees ?? allMemberIds;
      for (const memberId of attendees) attendeeQueries.push([ids[i], memberId]);
    });
    if (attendeeQueries.length > 0) {
      await sql.transaction((txn) =>
        attendeeQueries.map(([entryId, memberId]) =>
          txn.query('INSERT INTO fm_plan_entry_attendees (entry_id, member_id) VALUES ($1, $2)', [entryId, memberId])
        )
      );
    }
  } catch (err) {
    await sql.query('DELETE FROM fm_plan_entries WHERE id = ANY($1::int[])', [ids]);
    throw err;
  }

  const created = await Promise.all(ids.map((id) => fetchPlanEntryById(id)));
  return NextResponse.json(created, { status: 201 });
}
