import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { createRecipeSchema } from '@/lib/recipes-schema';
import { fetchAllRecipesWithCompat, fetchRecipeByIdWithCompat } from '@/lib/recipes-db';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get('q')?.trim().toLowerCase() ?? '';
  const mealType = params.get('mealType');
  const tag = params.get('tag');
  const includeArchived = params.get('archived') === '1';

  let recipes = await fetchAllRecipesWithCompat();

  if (!includeArchived) {
    recipes = recipes.filter((r) => !r.archived);
  }
  if (mealType) {
    recipes = recipes.filter((r) => r.meal_types.includes(mealType as never));
  }
  if (tag) {
    recipes = recipes.filter((r) => r.tags.includes(tag as never));
  }
  if (q) {
    recipes = recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q))
    );
  }

  return NextResponse.json(recipes);
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = createRecipeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }

  const {
    name,
    description,
    meal_types,
    tags,
    servings,
    prep_minutes,
    cook_minutes,
    method,
    source_url,
    favourite,
    ingredients,
  } = parsed.data;

  const [recipe] = await sql`
    INSERT INTO fm_recipes
      (name, description, meal_types, tags, servings, prep_minutes, cook_minutes, method, source_url, favourite)
    VALUES (
      ${name},
      ${description},
      ${JSON.stringify(meal_types)}::jsonb,
      ${JSON.stringify(tags)}::jsonb,
      ${servings},
      ${prep_minutes},
      ${cook_minutes},
      ${JSON.stringify(method)}::jsonb,
      ${source_url},
      ${favourite}
    )
    RETURNING id
  `;

  // The neon HTTP driver's sql.transaction() takes an eagerly-built array of
  // queries, so a later statement can't read an earlier one's RETURNING
  // value within a single transaction call — the recipe's id has to exist
  // before the ingredient inserts can reference it. The recipe row is
  // inserted first to get that id, then every ingredient row is inserted
  // together in one real transaction. If that second step fails, the
  // orphan recipe row (with no ingredients) is deleted to avoid leaving a
  // half-created dish on the menu.
  try {
    if (ingredients.length > 0) {
      await sql.transaction((txn) =>
        ingredients.map((ingredient, index) =>
          txn.query(
            `INSERT INTO fm_recipe_ingredients
              (recipe_id, position, name, quantity, unit, aisle, allergens, optional, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
            [
              recipe.id,
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
        )
      );
    }
  } catch (err) {
    await sql`DELETE FROM fm_recipes WHERE id = ${recipe.id}`;
    throw err;
  }

  const created = await fetchRecipeByIdWithCompat(recipe.id as number);
  return NextResponse.json(created, { status: 201 });
}
