import { z } from 'zod';
import { MEAL_TYPES } from './vocab';
import { isValidISODate } from './dates';

export const PLAN_STATUSES = ['planned', 'plated', 'eightysixed'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

// isValidISODate checks both shape (YYYY-MM-DD) and real calendar validity
// (round-trips through Date.UTC) — a shape-only regex let "2026-02-30"
// through to the database, where it either silently rolled over to a
// different date or, cast to a SQL `date`, crashed with a raw 500 instead
// of a clean 400. Every date this schema validates goes through here.
const isoDateSchema = z.string().refine(isValidISODate, 'Date must be a real YYYY-MM-DD calendar date');

// A recipe entry (recipe_id set) XOR a custom entry (custom_name set) — the
// db check constraint requires at least one, and the app's own invariant
// (a ticket is either a recipe or a custom dish, never both/neither) is
// stricter: EXACTLY one. createPlanEntrySchema mirrors that at the API
// boundary so a bad request 400s with a clear message instead of
// surfacing a raw Postgres constraint error or silently accepting a
// nonsensical "both" entry.
export const createPlanEntrySchema = z
  .object({
    service_date: isoDateSchema,
    slot: z.enum(MEAL_TYPES),
    recipe_id: z.number().int().positive().nullable().optional().default(null),
    custom_name: z.string().trim().min(1).max(120).nullable().optional().default(null),
    // Omitted entirely -> defaults to every household member (see the POST
    // route). An explicit [] is honoured as "nobody yet" and left as-is.
    attendees: z.array(z.number().int().positive()).optional(),
    servings: z.number().int().min(1).max(24).nullable().optional().default(null),
    notes: z.string().trim().max(500).nullable().optional().default(null),
  })
  .refine(
    (data) => {
      const hasRecipe = data.recipe_id !== null;
      const hasCustom = data.custom_name !== null && data.custom_name !== '';
      return hasRecipe !== hasCustom; // XOR: exactly one, not zero and not both
    },
    { message: 'Provide exactly one of recipe_id or custom_name', path: ['custom_name'] }
  );

export const patchPlanEntrySchema = z.object({
  service_date: isoDateSchema.optional(),
  slot: z.enum(MEAL_TYPES).optional(),
  recipe_id: z.number().int().positive().nullable().optional(),
  custom_name: z.string().trim().min(1).max(120).nullable().optional(),
  attendees: z.array(z.number().int().positive()).optional(),
  servings: z.number().int().min(1).max(24).nullable().optional(),
  status: z.enum(PLAN_STATUSES).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  position: z.number().int().min(0).optional(),
});

// POST /api/plan/fill — "Fire the week". week is normalised to its Monday
// server-side (startOfWeek), so any day within the intended week works.
// `today` is the CLIENT's own local date (see src/lib/dates.ts's todayISO
// doc comment on why "today" is deliberately local, not server/UTC time) —
// the route uses it, not its own clock, to skip proposing for any day
// that's already in the past. See docs/slices/04-order.md's carry-over fixes.
export const fillPlanSchema = z.object({
  week: isoDateSchema,
  today: isoDateSchema,
  slots: z.array(z.enum(MEAL_TYPES)).min(1).default(['dinner']),
  attendees: z.array(z.number().int().positive()).optional(),
  keepExisting: z.boolean().default(true),
  seed: z.string().trim().min(1).max(200).optional(),
});

// POST /api/plan/batch — "Fire" commits the proposals from /api/plan/fill.
// Always a recipe (never a custom entry — a gap ticket has no recipeId to
// fire in the first place, and the picker's "Something else" custom-name
// flow goes through the ordinary POST /api/plan instead).
export const batchPlanEntrySchema = z.object({
  entries: z
    .array(
      z.object({
        service_date: isoDateSchema,
        slot: z.enum(MEAL_TYPES),
        recipe_id: z.number().int().positive(),
        attendees: z.array(z.number().int().positive()).optional(),
      })
    )
    .min(1, 'At least one entry is required'),
  // QA (Slice 3, second pass): keepExisting=false REPLACE semantics — the
  // planned entries a fired proposal replaces (per fillWeek's `replaces`),
  // deleted in the same transaction as the new entries are inserted. Every
  // id here must currently be `planned` — see the route.
  replaceEntryIds: z.array(z.number().int().positive()).optional(),
});

export type CreatePlanEntryInput = z.infer<typeof createPlanEntrySchema>;
export type PatchPlanEntryInput = z.infer<typeof patchPlanEntrySchema>;
export type FillPlanInput = z.infer<typeof fillPlanSchema>;
export type BatchPlanEntryInput = z.infer<typeof batchPlanEntrySchema>;
