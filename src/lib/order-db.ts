import { sql } from './db';
import { addDays, startOfWeek } from './dates';
import { fetchPlanEntriesInRange } from './plan-db';
import { fetchAllRecipes } from './recipes-db';
import type { ShoppingLine, AggregateEntry } from './order';
import type { Aisle, Unit } from './vocab';
import type { CreateManualLineInput, PatchOrderItemInput } from './order-schema';

export interface OrderItemRow {
  id: number;
  week_start: string;
  key: string | null;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  aisle: Aisle;
  checked: boolean;
  manual: boolean;
  optional: boolean;
  /** True when a generated line's content was hand-edited and is preserved verbatim across regeneration — see patchOrderItem's doc comment. Always false for a manual line. */
  overridden: boolean;
  sources: ShoppingLine['sources'];
  created_at: string;
  updated_at: string;
}

// quantity::float8, not bare quantity — the neon driver returns a raw
// `numeric` column as a STRING (to avoid float precision loss on values it
// can't know the app's tolerance for), which broke formatQuantity() at
// render time ("quantity.toFixed is not a function"). Casting to float8
// (double precision) makes the driver hand back a genuine JS number, same
// as every other numeric value in this app; the ~15-significant-digit
// precision float8 gives up is irrelevant for shopping-list quantities.
const ITEM_SELECT = `
  SELECT id, week_start::text AS week_start, key, name, quantity::float8 AS quantity, unit, aisle, checked, manual,
         optional, overridden, sources, created_at, updated_at
  FROM fm_shopping_items
`;

export async function fetchOrderItems(weekStart: string): Promise<OrderItemRow[]> {
  const rows = await sql.query(`${ITEM_SELECT} WHERE week_start = $1 ORDER BY manual ASC, aisle ASC, name ASC`, [
    weekStart,
  ]);
  return rows as OrderItemRow[];
}

export interface OrderSummary {
  items: OrderItemRow[];
  total: number;
  checked: number;
  /** The most recent time a GENERATED line in this week was written — "PRINTED ..." on the receipt. null when nothing has been generated yet. */
  generatedAt: string | null;
}

export async function fetchOrderSummary(weekStart: string): Promise<OrderSummary> {
  const items = await fetchOrderItems(weekStart);
  const generatedRows = items.filter((i) => !i.manual);
  const generatedAt =
    generatedRows.length === 0
      ? null
      : generatedRows.reduce((latest, row) => (row.updated_at > latest ? row.updated_at : latest), generatedRows[0].updated_at);
  return {
    items,
    total: items.length,
    checked: items.filter((i) => i.checked).length,
    generatedAt,
  };
}

/**
 * The this-week `planned` pass entries, resolved to full ingredient lists,
 * ready for src/lib/order.ts's aggregate(). Only entries with a recipe
 * contribute (a custom entry like "Takeaway" has no ingredients to shop
 * for) — see docs/slices/04-order.md, "Aggregation input is this week's
 * planned entries only."
 */
export async function fetchAggregateEntriesForWeek(weekStart: string): Promise<AggregateEntry[]> {
  const monday = startOfWeek(weekStart);
  const sunday = addDays(monday, 6);
  const [entries, recipes] = await Promise.all([fetchPlanEntriesInRange(monday, sunday), fetchAllRecipes()]);
  const recipesById = new Map(recipes.map((r) => [r.id, r]));

  const result: AggregateEntry[] = [];
  for (const entry of entries) {
    if (entry.status !== 'planned' || entry.recipe_id === null) continue;
    const recipe = recipesById.get(entry.recipe_id);
    if (!recipe) continue; // defensive — FK is ON DELETE SET NULL, so this shouldn't happen
    result.push({
      entryId: entry.id,
      recipeId: recipe.id,
      recipeName: recipe.name,
      recipeServings: recipe.servings,
      servings: entry.servings,
      attendeeCount: entry.attendees.length,
      ingredients: recipe.ingredients.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        aisle: i.aisle,
        optional: i.optional,
      })),
    });
  }
  return result;
}

/**
 * Writes `lines` (aggregate()'s freshly computed generated lines) as the
 * week's complete set of generated rows: upserts each by (week_start, key)
 * — preserving whatever `checked` aggregate() already carried over — then
 * deletes any generated row whose key isn't in the new set (a dish removed
 * from the pass since the last generate). Manual rows (`manual = true`) are
 * never touched by this at all — see docs/slices/04-order.md's API section
 * and this slice's Build notes.
 */
export async function regenerateGeneratedLines(weekStart: string, lines: ShoppingLine[]): Promise<void> {
  const keys = lines.map((l) => l.key);

  await sql.transaction((txn) => {
    const queries = lines.map((line) =>
      txn.query(
        `INSERT INTO fm_shopping_items
           (week_start, key, name, quantity, unit, aisle, checked, manual, optional, overridden, sources, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10::jsonb, now())
         ON CONFLICT (week_start, key) WHERE key IS NOT NULL
         DO UPDATE SET
           name = EXCLUDED.name, quantity = EXCLUDED.quantity, unit = EXCLUDED.unit, aisle = EXCLUDED.aisle,
           checked = EXCLUDED.checked, optional = EXCLUDED.optional, overridden = EXCLUDED.overridden,
           sources = EXCLUDED.sources, updated_at = now()`,
        [
          weekStart,
          line.key,
          line.name,
          line.quantity,
          line.unit,
          line.aisle,
          line.checked,
          line.optional,
          line.overridden,
          JSON.stringify(line.sources),
        ]
      )
    );
    // Every generated row for this week whose key ISN'T in the fresh set —
    // a dish taken off the pass since the last generate. `= ANY('{}')` is
    // false for every row, so an empty `keys` array correctly clears every
    // generated line for the week (an empty pass).
    queries.push(
      txn.query('DELETE FROM fm_shopping_items WHERE week_start = $1 AND manual = false AND NOT (key = ANY($2::text[]))', [
        weekStart,
        keys,
      ])
    );
    return queries;
  });
}

export async function insertManualLine(weekStart: string, input: CreateManualLineInput): Promise<OrderItemRow> {
  const [row] = await sql`
    INSERT INTO fm_shopping_items (week_start, key, name, quantity, unit, aisle, checked, manual, optional, overridden, sources)
    VALUES (${weekStart}, null, ${input.name}, ${input.quantity}, ${input.unit}, ${input.aisle}, false, true, false, false, '[]'::jsonb)
    RETURNING id, week_start::text AS week_start, key, name, quantity::float8 AS quantity, unit, aisle, checked,
              manual, optional, overridden, sources, created_at, updated_at
  `;
  return row as OrderItemRow;
}

export async function fetchOrderItemById(id: number): Promise<OrderItemRow | null> {
  const rows = await sql.query(`${ITEM_SELECT} WHERE id = $1`, [id]);
  return (rows as OrderItemRow[])[0] ?? null;
}

/**
 * `checked?`-only patches update in place. QA (second pass) product
 * decision — editing a generated line no longer converts it to a duplicate
 * manual row: patching any CONTENT field (name/quantity/unit/aisle) on a
 * still-generated line (`manual = false`, so it has a real `key`) instead
 * sets `overridden = true` IN PLACE, keeping the same row/key. The next
 * `POST /api/order/generate` then preserves this row's name/quantity/unit/
 * aisle/checked exactly (see src/lib/order.ts's `aggregate()`), refreshing
 * only its `sources`, and removes it if its key stops being produced at all
 * (the dish left the plan). "Undo edit" clears the flag by PATCHing
 * `{ overridden: false }` (the schema only ever accepts `false` here — a
 * client can never set `overridden: true` directly); the client is
 * expected to call `POST /api/order/generate` right after, to actually
 * restore the computed values (clearing the flag alone doesn't recompute
 * anything by itself). A manual line's own edits are unaffected — it has no
 * key/generated status to override in the first place. Returns null when
 * `id` doesn't exist.
 */
export async function patchOrderItem(id: number, input: PatchOrderItemInput): Promise<OrderItemRow | null> {
  const existing = await fetchOrderItemById(id);
  if (!existing) return null;

  const editsContent =
    input.name !== undefined || input.quantity !== undefined || input.unit !== undefined || input.aisle !== undefined;
  const setsOverride = !existing.manual && editsContent;
  // The schema only accepts `overridden: false` in a PATCH body — this is
  // "Undo edit", the only client-driven way `overridden` can ever clear.
  const clearsOverride = input.overridden === false;

  const fields: [string, unknown][] = [];
  if (input.name !== undefined) fields.push(['name', input.name]);
  if (input.quantity !== undefined) fields.push(['quantity', input.quantity]);
  if (input.unit !== undefined) fields.push(['unit', input.unit]);
  if (input.aisle !== undefined) fields.push(['aisle', input.aisle]);
  if (input.checked !== undefined) fields.push(['checked', input.checked]);
  if (setsOverride) {
    fields.push(['overridden', true]);
  } else if (clearsOverride) {
    fields.push(['overridden', false]);
  }

  if (fields.length === 0) return existing;

  const setClauses = fields.map(([col], i) => `${col} = $${i + 1}`);
  setClauses.push('updated_at = now()');
  const idIndex = fields.length + 1;
  await sql.query(`UPDATE fm_shopping_items SET ${setClauses.join(', ')} WHERE id = $${idIndex}`, [
    ...fields.map(([, value]) => value),
    id,
  ]);

  return fetchOrderItemById(id);
}

export async function deleteOrderItem(id: number): Promise<boolean> {
  const [deleted] = await sql`DELETE FROM fm_shopping_items WHERE id = ${id} RETURNING id`;
  return Boolean(deleted);
}

/** POST /api/order/clear — deletes every ticked line for the week (manual and generated alike). */
export async function clearCheckedLines(weekStart: string): Promise<number> {
  const deleted = await sql`
    DELETE FROM fm_shopping_items WHERE week_start = ${weekStart} AND checked = true RETURNING id
  `;
  return deleted.length;
}
