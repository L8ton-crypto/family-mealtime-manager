import { describe, expect, it } from 'vitest';
import { checkRatingEligibility } from './ratings-schema';

const base = { entryRecipeId: 3, entryStatus: 'plated' as const, entryAttendeeIds: [12, 16], memberId: 12 };

describe('checkRatingEligibility', () => {
  it('is ok when the entry is plated, has a recipe, and the member attended', () => {
    expect(checkRatingEligibility(base)).toEqual({ ok: true });
  });

  it('rejects a custom entry with no recipe', () => {
    expect(checkRatingEligibility({ ...base, entryRecipeId: null })).toEqual({
      ok: false,
      message: 'This entry has no dish to rate',
    });
  });

  it('rejects a "planned" (not yet plated) entry', () => {
    expect(checkRatingEligibility({ ...base, entryStatus: 'planned' })).toEqual({
      ok: false,
      message: 'Plate check is for plated services',
    });
  });

  it('rejects an "eightysixed" entry', () => {
    expect(checkRatingEligibility({ ...base, entryStatus: 'eightysixed' })).toEqual({
      ok: false,
      message: 'Plate check is for plated services',
    });
  });

  it('rejects a member who is not an attendee of the entry', () => {
    expect(checkRatingEligibility({ ...base, memberId: 99 })).toEqual({
      ok: false,
      message: 'Member did not eat this service',
    });
  });

  it('checks recipe/status before attendance, so a non-attendee of a non-plated custom entry gets the recipe message', () => {
    expect(checkRatingEligibility({ ...base, entryRecipeId: null, entryStatus: 'planned', memberId: 99 })).toEqual({
      ok: false,
      message: 'This entry has no dish to rate',
    });
  });
});
