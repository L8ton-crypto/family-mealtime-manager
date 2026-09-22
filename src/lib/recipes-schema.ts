import { z } from 'zod';
import { MEAL_TYPES, TAGS, UNITS, AISLES, ALLERGENS } from './vocab';

// Empty string from a form field means "no source URL", same as null.
const sourceUrlSchema = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
  z.string().trim().url('Source URL must be a valid URL').nullable()
);

const ingredientSchema = z.object({
  name: z.string().trim().min(1, 'Ingredient name is required').max(120),
  quantity: z.number().positive().nullable().optional().default(null),
  unit: z.enum(UNITS).nullable().optional().default(null),
  aisle: z.enum(AISLES).default('pantry'),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]),
  optional: z.boolean().default(false),
  note: z.string().trim().max(200).nullable().optional().default(null),
});

export const createRecipeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(500).default(''),
  meal_types: z.array(z.enum(MEAL_TYPES)).min(1, 'At least one meal type is required').default(['dinner']),
  tags: z.array(z.enum(TAGS)).default([]),
  servings: z.number().int().min(1).max(24).default(4),
  prep_minutes: z.number().int().min(0).max(1440).default(0),
  cook_minutes: z.number().int().min(0).max(1440).default(0),
  method: z.array(z.string().trim().min(1)).default([]),
  source_url: sourceUrlSchema.optional().default(null),
  favourite: z.boolean().default(false),
  // A recipe with zero ingredients isn't a real menu card — at least one is
  // required on create, and PATCH below rejects an explicit empty array too
  // (omitting `ingredients` entirely from a PATCH still means "leave as is").
  ingredients: z.array(ingredientSchema).min(1, 'At least one ingredient is required'),
});

export const patchRecipeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120).optional(),
  description: z.string().trim().max(500).optional(),
  meal_types: z.array(z.enum(MEAL_TYPES)).min(1).optional(),
  tags: z.array(z.enum(TAGS)).optional(),
  servings: z.number().int().min(1).max(24).optional(),
  prep_minutes: z.number().int().min(0).max(1440).optional(),
  cook_minutes: z.number().int().min(0).max(1440).optional(),
  method: z.array(z.string().trim().min(1)).optional(),
  source_url: sourceUrlSchema.optional(),
  favourite: z.boolean().optional(),
  archived: z.boolean().optional(),
  ingredients: z.array(ingredientSchema).min(1, 'At least one ingredient is required').optional(),
});

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type PatchRecipeInput = z.infer<typeof patchRecipeSchema>;
export type RecipeIngredientInput = z.infer<typeof ingredientSchema>;
