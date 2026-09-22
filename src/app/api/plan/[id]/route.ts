import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { patchPlanEntrySchema } from '@/lib/plan-schema';
import { fetchPlanEntryById } from '@/lib/plan-db';

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'Invalid id' }] }, { status: 400 });
  }
  const entry = await fetchPlanEntryById(id);
  if (!entry) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(entry);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'Invalid id' }] }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchPlanEntrySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  const existingRows = await sql`
    SELECT id, service_date::text AS service_date, slot, recipe_id, custom_name
    FROM fm_plan_entries WHERE id = ${id}
  `;
  const existing = existingRows[0] as
    | { id: number; service_date: string; slot: string; recipe_id: number | null; custom_name: string | null }
    | undefined;
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // A recipe entry and a custom entry are mutually exclusive. Explicitly
  // setting both non-null values in one patch is rejected outright (there's
  // no sensible way to resolve that ambiguity); setting just one of them
  // (to a non-null value) automatically clears the other, even if the
  // other field wasn't mentioned in the request — e.g. Swap dish only ever
  // sends `recipe_id`, and the previous `custom_name` must still clear.
  const settingRecipe = data.recipe_id !== undefined && data.recipe_id !== null;
  const settingCustom = data.custom_name !== undefined && data.custom_name !== null;
  if (settingRecipe && settingCustom) {
    return NextResponse.json(
      { error: 'validation', issues: [{ message: 'Cannot set both recipe_id and custom_name' }] },
      { status: 400 }
    );
  }
  const effectiveRecipeId = settingCustom ? null : data.recipe_id;
  const effectiveCustomName = settingRecipe ? null : data.custom_name;

  // Pre-validate the db's "recipe_id or custom_name" check constraint so a
  // bad patch (e.g. clearing recipe_id without setting custom_name) 400s
  // with a clear message instead of surfacing a raw Postgres error.
  const nextRecipeId = effectiveRecipeId !== undefined ? effectiveRecipeId : existing.recipe_id;
  const nextCustomName = effectiveCustomName !== undefined ? effectiveCustomName : existing.custom_name;
  if (nextRecipeId === null && (nextCustomName === null || nextCustomName === '')) {
    return NextResponse.json(
      { error: 'validation', issues: [{ message: 'Either recipe_id or custom_name is required' }] },
      { status: 400 }
    );
  }

  if (settingRecipe) {
    const [recipeExists] = await sql`SELECT id, archived FROM fm_recipes WHERE id = ${data.recipe_id}`;
    if (!recipeExists) {
      return NextResponse.json(
        { error: 'validation', issues: [{ message: 'recipe_id does not exist' }] },
        { status: 400 }
      );
    }
    // An archived ("86'd") dish can't be (re)planned — see POST /api/plan.
    if (recipeExists.archived) {
      return NextResponse.json({ error: 'validation', issues: [{ message: "dish is 86'd" }] }, { status: 400 });
    }
  }

  if (data.attendees !== undefined && data.attendees.length > 0) {
    const rows = await sql.query('SELECT id FROM fm_members WHERE id = ANY($1::int[])', [data.attendees]);
    if (rows.length !== new Set(data.attendees).size) {
      return NextResponse.json(
        { error: 'validation', issues: [{ message: 'One or more attendee ids do not exist' }] },
        { status: 400 }
      );
    }
  }

  // A move (service_date and/or slot changing) appends to the END of the
  // destination slot — same "MAX(position) + 1" rule POST uses for a brand
  // new entry — unless the caller explicitly supplied its own `position`,
  // which is respected as-is.
  const destinationDate = data.service_date ?? existing.service_date;
  const destinationSlot = data.slot ?? existing.slot;
  const isMoving = destinationDate !== existing.service_date || destinationSlot !== existing.slot;
  let resolvedPosition = data.position;
  if (isMoving && resolvedPosition === undefined) {
    const [{ next }] = (await sql`
      SELECT COALESCE(MAX(position), -1) + 1 AS next
      FROM fm_plan_entries
      WHERE service_date = ${destinationDate} AND slot = ${destinationSlot}
    `) as { next: number }[];
    resolvedPosition = next;
  }

  // Build the SET clause from only the fields actually present in the
  // patch body (checking !== undefined), same pattern fm_recipes' PATCH
  // uses — a plain COALESCE trick can't tell "field omitted" from "field
  // explicitly set to null/0". recipe_id/custom_name use their EFFECTIVE
  // (post-mutual-exclusion) values, and position uses the resolved
  // (possibly auto-appended) value, not the raw request body.
  const fields: [string, unknown][] = [];
  if (data.service_date !== undefined) fields.push(['service_date', data.service_date]);
  if (data.slot !== undefined) fields.push(['slot', data.slot]);
  if (effectiveRecipeId !== undefined) fields.push(['recipe_id', effectiveRecipeId]);
  if (effectiveCustomName !== undefined) fields.push(['custom_name', effectiveCustomName]);
  if (data.servings !== undefined) fields.push(['servings', data.servings]);
  if (data.status !== undefined) fields.push(['status', data.status]);
  if (data.notes !== undefined) fields.push(['notes', data.notes]);
  if (resolvedPosition !== undefined) fields.push(['position', resolvedPosition]);

  const setClauses = fields.map(([col], i) => `${col} = $${i + 1}`);
  setClauses.push('updated_at = now()');
  const idParamIndex = fields.length + 1;
  const updateSql = `UPDATE fm_plan_entries SET ${setClauses.join(', ')} WHERE id = $${idParamIndex}`;
  const updateValues = [...fields.map(([, value]) => value), id];

  // The id is already known here (unlike POST's create step), so the
  // scalar-field update and the attendee replace (delete + re-insert) run
  // together in one genuine transaction.
  await sql.transaction((txn) => {
    const queries = [txn.query(updateSql, updateValues)];
    if (data.attendees !== undefined) {
      queries.push(txn.query('DELETE FROM fm_plan_entry_attendees WHERE entry_id = $1', [id]));
      data.attendees.forEach((memberId) => {
        queries.push(
          txn.query('INSERT INTO fm_plan_entry_attendees (entry_id, member_id) VALUES ($1, $2)', [id, memberId])
        );
      });
    }
    return queries;
  });

  const updated = await fetchPlanEntryById(id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'Invalid id' }] }, { status: 400 });
  }

  // Hard delete, per docs/slices/02-pass.md — attendees cascade via the FK.
  const [deleted] = await sql`DELETE FROM fm_plan_entries WHERE id = ${id} RETURNING id`;
  if (!deleted) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
