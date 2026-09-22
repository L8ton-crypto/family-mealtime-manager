import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { createPlanEntrySchema } from '@/lib/plan-schema';
import { isValidISODate } from '@/lib/dates';
import { fetchAllMemberIds, fetchPlanEntriesInRange, fetchPlanEntryById } from '@/lib/plan-db';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const from = params.get('from');
  const to = params.get('to');
  // isValidISODate, not just a shape regex — "from=2026-02-30" must 400,
  // never reach a SQL `date` comparison (which would either crash or
  // silently behave oddly depending on the driver).
  if (!from || !to || !isValidISODate(from) || !isValidISODate(to)) {
    return NextResponse.json(
      { error: 'validation', issues: [{ message: 'from and to are required, as a real YYYY-MM-DD calendar date' }] },
      { status: 400 }
    );
  }

  const entries = await fetchPlanEntriesInRange(from, to);
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = createPlanEntrySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const { service_date, slot, recipe_id, custom_name, servings, notes } = parsed.data;

  if (recipe_id !== null) {
    const [existing] = await sql`SELECT id, archived FROM fm_recipes WHERE id = ${recipe_id}`;
    if (!existing) {
      return NextResponse.json(
        { error: 'validation', issues: [{ message: 'recipe_id does not exist' }] },
        { status: 400 }
      );
    }
    // An archived ("86'd") dish is off the menu — it can't be put on the
    // pass. Checked here (not just hidden in the UI) so a stale client or a
    // direct API call can't plan a dish that was archived out from under it.
    if (existing.archived) {
      return NextResponse.json(
        { error: 'validation', issues: [{ message: "dish is 86'd" }] },
        { status: 400 }
      );
    }
  }

  // Missing attendees defaults to every household member. An explicit []
  // is honoured as "nobody yet".
  const attendees = parsed.data.attendees ?? (await fetchAllMemberIds());

  if (attendees.length > 0) {
    const rows = await sql.query('SELECT id FROM fm_members WHERE id = ANY($1::int[])', [attendees]);
    if (rows.length !== new Set(attendees).size) {
      return NextResponse.json(
        { error: 'validation', issues: [{ message: 'One or more attendee ids do not exist' }] },
        { status: 400 }
      );
    }
  }

  const [{ next: nextPosition }] = (await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next
    FROM fm_plan_entries
    WHERE service_date = ${service_date} AND slot = ${slot}
  `) as { next: number }[];

  // The neon HTTP driver's sql.transaction() can't have a later query read
  // an earlier one's RETURNING value, so the entry row is inserted first to
  // get its id (same two-step pattern fm_recipes/fm_recipe_ingredients
  // uses), then every attendee row together in one real transaction. If
  // that second step fails, the orphan entry row is deleted.
  const [entry] = await sql`
    INSERT INTO fm_plan_entries (service_date, slot, recipe_id, custom_name, servings, notes, position)
    VALUES (${service_date}, ${slot}, ${recipe_id}, ${custom_name}, ${servings}, ${notes}, ${nextPosition})
    RETURNING id
  `;

  try {
    if (attendees.length > 0) {
      await sql.transaction((txn) =>
        attendees.map((memberId) =>
          txn.query('INSERT INTO fm_plan_entry_attendees (entry_id, member_id) VALUES ($1, $2)', [
            entry.id,
            memberId,
          ])
        )
      );
    }
  } catch (err) {
    await sql`DELETE FROM fm_plan_entries WHERE id = ${entry.id}`;
    throw err;
  }

  const created = await fetchPlanEntryById(entry.id as number);
  return NextResponse.json(created, { status: 201 });
}
