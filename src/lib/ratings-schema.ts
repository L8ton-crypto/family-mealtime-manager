import { z } from 'zod';
import { VERDICTS } from './vocab';
import type { PlanStatus } from './plan-schema';

// PUT /api/ratings upserts one (entry_id, member_id) verdict — see
// docs/slices/03-engine.md and db/migrations/004_engine.sql's unique
// constraint.
export const putRatingSchema = z.object({
  entry_id: z.number().int().positive(),
  member_id: z.number().int().positive(),
  verdict: z.enum(VERDICTS),
  note: z.string().trim().max(300).nullable().optional().default(null),
});

export type PutRatingInput = z.infer<typeof putRatingSchema>;

// QA (Slice 3, second pass): PUT /api/ratings must reject a rating for a
// member who wasn't actually down as a cover for the service, and for a
// service that hasn't been plated yet. Extracted as a pure function (no DB
// access) so it's directly unit-testable, separate from the route handler's
// own existence lookups (entry exists / member exists), which still need
// the database.
export interface RatingEligibilityInput {
  /** null means the entry has no recipe (a custom entry like "Takeaway") — nothing to rate. */
  entryRecipeId: number | null;
  entryStatus: PlanStatus;
  entryAttendeeIds: number[];
  memberId: number;
}

export type RatingEligibilityResult = { ok: true } | { ok: false; message: string };

export function checkRatingEligibility(input: RatingEligibilityInput): RatingEligibilityResult {
  if (input.entryRecipeId === null) {
    return { ok: false, message: 'This entry has no dish to rate' };
  }
  if (input.entryStatus !== 'plated') {
    return { ok: false, message: 'Plate check is for plated services' };
  }
  if (!input.entryAttendeeIds.includes(input.memberId)) {
    return { ok: false, message: 'Member did not eat this service' };
  }
  return { ok: true };
}
