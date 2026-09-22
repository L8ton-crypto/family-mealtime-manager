#!/usr/bin/env node
// Seeds db/seed/recipes.json into fm_recipes / fm_recipe_ingredients.
// Idempotent by name: a recipe whose name already exists in fm_recipes is
// left alone (not re-inserted, not overwritten) so re-running `npm run
// seed` after hand-editing a seeded recipe in the app doesn't clobber it.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal() {
  const envPath = path.join(rootDir, '.env.local');
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set (checked process.env and .env.local)');
  }

  const sql = neon(databaseUrl);

  const seedPath = path.join(rootDir, 'db', 'seed', 'recipes.json');
  const recipes = JSON.parse(readFileSync(seedPath, 'utf8'));

  const existingRows = await sql.query('SELECT name FROM fm_recipes');
  const existingNames = new Set(existingRows.map((r) => r.name));

  let inserted = 0;
  let skipped = 0;

  for (const recipe of recipes) {
    if (existingNames.has(recipe.name)) {
      console.log(`skip  ${recipe.name} (already seeded)`);
      skipped += 1;
      continue;
    }

    const {
      name,
      description = '',
      meal_types = ['dinner'],
      tags = [],
      servings = 4,
      prep_minutes = 0,
      cook_minutes = 0,
      method = [],
      source_url = null,
      favourite = false,
      ingredients = [],
    } = recipe;

    // neon's sql.transaction doesn't let a later statement read an earlier
    // one's result within the same call, so the recipe is inserted first to
    // get its id, then its ingredient rows are inserted together in one
    // transaction below. A recipe with no ingredients (there are none in
    // the seed data) would just leave that second transaction skipped.
    const [insertedRecipe] = await sql.query(
      `INSERT INTO fm_recipes
        (name, description, meal_types, tags, servings, prep_minutes, cook_minutes, method, source_url, favourite, seeded)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8::jsonb, $9, $10, true)
       RETURNING id`,
      [
        name,
        description,
        JSON.stringify(meal_types),
        JSON.stringify(tags),
        servings,
        prep_minutes,
        cook_minutes,
        JSON.stringify(method),
        source_url,
        favourite,
      ]
    );

    const recipeId = insertedRecipe.id;

    // Mirrors the POST /api/recipes route: if the ingredient insert fails
    // partway through, the orphan recipe row (with no, or only some, of its
    // ingredients) is deleted rather than left behind as a broken dish that
    // a re-run of this script would then skip forever (it's already in
    // fm_recipes by name, so the idempotency check above would never retry
    // it).
    try {
      if (ingredients.length > 0) {
        await sql.transaction((txn) =>
          ingredients.map((ingredient, index) =>
            txn.query(
              `INSERT INTO fm_recipe_ingredients
                (recipe_id, position, name, quantity, unit, aisle, allergens, optional, note)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
              [
                recipeId,
                index,
                ingredient.name,
                ingredient.quantity ?? null,
                ingredient.unit ?? null,
                ingredient.aisle ?? 'pantry',
                JSON.stringify(ingredient.allergens ?? []),
                ingredient.optional ?? false,
                ingredient.note ?? null,
              ]
            )
          )
        );
      }
    } catch (err) {
      await sql.query('DELETE FROM fm_recipes WHERE id = $1', [recipeId]);
      throw err;
    }

    console.log(`seed  ${name} (${ingredients.length} ingredients)`);
    inserted += 1;
  }

  console.log(`Done. Inserted ${inserted}, skipped ${skipped} (already seeded).`);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
