import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { patchRecipeSchema } from '@/lib/recipes-schema';
import { fetchRecipeByIdWithCompat, fetchRecipeRecord } from '@/lib/recipes-db';

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

  const recipe = await fetchRecipeByIdWithCompat(id);
  if (!recipe) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const record = await fetchRecipeRecord(id);
  return NextResponse.json({ ...recipe, record });
}

const JSONB_COLUMNS = new Set(['meal_types', 'tags', 'method']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'Invalid id' }] }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchRecipeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await sql`SELECT id FROM fm_recipes WHERE id = ${id}`;
  if (existing.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Build the SET clause from only the fields actually present in the
  // patch body. A plain COALESCE(${value ?? null}, column) trick — used for
  // fm_members — can't tell "field omitted" from "field explicitly set to
  // false/empty" for booleans like favourite/archived, so this checks
  // `!== undefined` instead.
  const fields: [string, unknown][] = [];
  if (data.name !== undefined) fields.push(['name', data.name]);
  if (data.description !== undefined) fields.push(['description', data.description]);
  if (data.meal_types !== undefined) fields.push(['meal_types', JSON.stringify(data.meal_types)]);
  if (data.tags !== undefined) fields.push(['tags', JSON.stringify(data.tags)]);
  if (data.servings !== undefined) fields.push(['servings', data.servings]);
  if (data.prep_minutes !== undefined) fields.push(['prep_minutes', data.prep_minutes]);
  if (data.cook_minutes !== undefined) fields.push(['cook_minutes', data.cook_minutes]);
  if (data.method !== undefined) fields.push(['method', JSON.stringify(data.method)]);
  if (data.source_url !== undefined) fields.push(['source_url', data.source_url]);
  if (data.favourite !== undefined) fields.push(['favourite', data.favourite]);
  if (data.archived !== undefined) fields.push(['archived', data.archived]);

  const setClauses = fields.map(([col], i) => `${col} = $${i + 1}${JSONB_COLUMNS.has(col) ? '::jsonb' : ''}`);
  setClauses.push('updated_at = now()');
  const idParamIndex = fields.length + 1;
  const updateSql = `UPDATE fm_recipes SET ${setClauses.join(', ')} WHERE id = $${idParamIndex}`;
  const updateValues = [...fields.map(([, value]) => value), id];

  await sql.transaction((txn) => {
    const queries = [txn.query(updateSql, updateValues)];

    if (data.ingredients !== undefined) {
      queries.push(txn.query('DELETE FROM fm_recipe_ingredients WHERE recipe_id = $1', [id]));
      data.ingredients.forEach((ingredient, index) => {
        queries.push(
          txn.query(
            `INSERT INTO fm_recipe_ingredients
              (recipe_id, position, name, quantity, unit, aisle, allergens, optional, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
            [
              id,
              index,
              ingredient.name,
              ingredient.quantity,
              ingredient.unit,
              ingredient.aisle,
              JSON.stringify(ingredient.allergens),
              ingredient.optional,
              ingredient.note,
            ]
          )
        );
      });
    }

    return queries;
  });

  const updated = await fetchRecipeByIdWithCompat(id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'Invalid id' }] }, { status: 400 });
  }

  // Soft delete only — archives the dish. There is no hard-delete query
  // param; ?hard=1 is deliberately not supported (per docs/slices/01-menu.md).
  const [deleted] = await sql`
    UPDATE fm_recipes SET archived = true, updated_at = now() WHERE id = ${id} RETURNING id
  `;
  if (!deleted) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
