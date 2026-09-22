import { describe, expect, it } from 'vitest';
import { jitter, scoreRecipe, type EngineMember, type EngineRating, type EngineRecipe, type HistoryEntry, type ScoreContext } from './score';

function recipe(overrides: Partial<EngineRecipe> = {}): EngineRecipe {
  return {
    id: 1,
    name: 'Test Dish',
    tags: [],
    mealTypes: ['dinner'],
    ingredients: [{ name: 'rice', aisle: 'pantry', allergens: [], optional: false }],
    prepMinutes: 10,
    cookMinutes: 10,
    favourite: false,
    archived: false,
    ...overrides,
  };
}

function member(overrides: Partial<EngineMember> = {}): EngineMember {
  return {
    id: 1,
    name: 'Ada',
    ageGroup: 'adult',
    likes: [],
    dislikes: [],
    restrictions: [],
    allergies: [],
    ...overrides,
  };
}

function ctx(overrides: Partial<ScoreContext> = {}): ScoreContext {
  return {
    date: '2026-09-23', // a Wednesday — a plain weekday, avoids incidental effort-fit bonuses
    slot: 'dinner',
    attendees: [member()],
    history: [],
    ratings: [],
    seed: 'fixed-seed',
    ...overrides,
  };
}

function reasonText(result: ReturnType<typeof scoreRecipe>, text: string) {
  return result?.reasons.find((r) => r.text === text);
}

describe('scoreRecipe — hard filters', () => {
  it('returns null for an archived recipe', () => {
    expect(scoreRecipe(recipe({ archived: true }), ctx())).toBeNull();
  });

  it('returns null when the slot is not one of the recipe\'s meal types', () => {
    expect(scoreRecipe(recipe({ mealTypes: ['breakfast'] }), ctx({ slot: 'dinner' }))).toBeNull();
  });

  it('returns null when a recipe is unsafe for the attendees (allergy)', () => {
    const fishPie = recipe({ ingredients: [{ name: 'cod', aisle: 'meat-fish', allergens: ['fish'], optional: false }] });
    const ada = member({ name: 'Ada', allergies: ['fish'] });
    expect(scoreRecipe(fishPie, ctx({ attendees: [ada] }))).toBeNull();
  });

  it('is suggestible again once the unsafe attendee is excluded', () => {
    const fishPie = recipe({ ingredients: [{ name: 'cod', aisle: 'meat-fish', allergens: ['fish'], optional: false }] });
    const ben = member({ id: 2, name: 'Ben', allergies: [] });
    expect(scoreRecipe(fishPie, ctx({ attendees: [ben] }))).not.toBeNull();
  });
});

describe('scoreRecipe — plate history (recency-weighted verdicts)', () => {
  const ratingAt = (recipeId: number, memberId: number, verdict: 'clean' | 'half' | 'left', ratedAt: string): EngineRating => ({
    recipeId,
    memberId,
    verdict,
    ratedAt,
  });

  it('a single clean verdict reads as "...came back clean last time" and adds +12', () => {
    const ratings = [ratingAt(1, 1, 'clean', '2026-09-10T00:00:00Z')];
    const result = scoreRecipe(recipe(), ctx({ ratings }));
    expect(reasonText(result, "Ada's plate came back clean last time")).toEqual({
      text: "Ada's plate came back clean last time",
      delta: 12,
    });
    expect(result!.score).toBe(50 + 12 + jitter('fixed-seed', 1));
  });

  it('a single left verdict reads as "left it last time" and subtracts 15', () => {
    const ratings = [ratingAt(1, 1, 'left', '2026-09-10T00:00:00Z')];
    const result = scoreRecipe(recipe(), ctx({ ratings }));
    expect(reasonText(result, 'Ada left it last time')).toEqual({ text: 'Ada left it last time', delta: -15 });
  });

  it('a single half verdict reads as "only ate half last time" and adds +2', () => {
    const ratings = [ratingAt(1, 1, 'half', '2026-09-10T00:00:00Z')];
    const result = scoreRecipe(recipe(), ctx({ ratings }));
    expect(reasonText(result, 'Ada only ate half last time')).toEqual({ text: 'Ada only ate half last time', delta: 2 });
  });

  it('two clean verdicts in a row read as "...clean twice"', () => {
    const ratings = [ratingAt(1, 1, 'clean', '2026-09-10T00:00:00Z'), ratingAt(1, 1, 'clean', '2026-09-03T00:00:00Z')];
    const result = scoreRecipe(recipe(), ctx({ ratings }));
    // weighted average of two clean (12) verdicts at weights 3 and 2 is still 12
    expect(reasonText(result, "Ada's plate came back clean twice")).toEqual({
      text: "Ada's plate came back clean twice",
      delta: 12,
    });
  });

  it('only the 3 most recent verdicts count, weighted 3/2/1, and a 4th older one is ignored', () => {
    const ratings = [
      ratingAt(1, 1, 'clean', '2026-09-20T00:00:00Z'), // most recent -> weight 3
      ratingAt(1, 1, 'clean', '2026-09-15T00:00:00Z'), // weight 2
      ratingAt(1, 1, 'left', '2026-09-10T00:00:00Z'), // weight 1
      ratingAt(1, 1, 'left', '2026-01-01T00:00:00Z'), // too old to count at all
    ];
    const result = scoreRecipe(recipe(), ctx({ ratings }));
    // (12*3 + 12*2 + -15*1) / 6 = (36+24-15)/6 = 45/6 = 7.5 -> rounds to 8
    const delta = result!.reasons.find((r) => r.text.startsWith('Ada'))!.delta;
    expect(delta).toBe(8);
  });

  it('only counts ratings for the attendee actually present', () => {
    const ratings = [ratingAt(1, 99, 'left', '2026-09-10T00:00:00Z')]; // member 99 isn't attending
    const result = scoreRecipe(recipe(), ctx({ ratings, attendees: [member({ id: 1, name: 'Ada' })] }));
    expect(result!.reasons.some((r) => r.text.includes('left'))).toBe(false);
  });
});

describe('scoreRecipe — likes and dislikes', () => {
  it('adds +8 per member who likes an ingredient/tag/name match, naming the liked term', () => {
    const chickenDish = recipe({ name: 'Chicken Curry' });
    const sam = member({ name: 'Sam', likes: ['chicken'] });
    const result = scoreRecipe(chickenDish, ctx({ attendees: [sam] }));
    expect(reasonText(result, 'Sam likes chicken')).toEqual({ text: 'Sam likes chicken', delta: 8 });
  });

  it('subtracts 12 per member who dislikes an ingredient, naming it', () => {
    const dish = recipe({ ingredients: [{ name: 'mushrooms', aisle: 'produce', allergens: [], optional: false }] });
    const ada = member({ name: 'Ada', dislikes: ['mushrooms'] });
    const result = scoreRecipe(dish, ctx({ attendees: [ada] }));
    expect(reasonText(result, 'Ada dislikes mushrooms')).toEqual({ text: 'Ada dislikes mushrooms', delta: -12 });
  });

  it('is word-boundary safe — "ham" does not match "shame" or "hamburger" partial words', () => {
    const dish = recipe({ name: 'Shame Sandwich' });
    const ada = member({ name: 'Ada', likes: ['ham'] });
    const result = scoreRecipe(dish, ctx({ attendees: [ada] }));
    expect(result!.reasons.some((r) => r.text.includes('likes'))).toBe(false);
  });

  // QA (Slice 3, second pass): plural tolerance, matching compat.ts's
  // customAllergyPattern via the shared src/lib/textMatch.ts matcher.
  it('is plural-tolerant — a dislike of "mushrooms" matches a singular "mushroom" ingredient', () => {
    const dish = recipe({ ingredients: [{ name: 'mushroom', aisle: 'produce', allergens: [], optional: false }] });
    const ada = member({ name: 'Ada', dislikes: ['mushrooms'] });
    const result = scoreRecipe(dish, ctx({ attendees: [ada] }));
    expect(reasonText(result, 'Ada dislikes mushrooms')).toEqual({ text: 'Ada dislikes mushrooms', delta: -12 });
  });

  it('is plural-tolerant — a like of "kiwi" matches a plural "kiwis" ingredient', () => {
    const dish = recipe({ ingredients: [{ name: 'kiwis', aisle: 'produce', allergens: [], optional: false }] });
    const sam = member({ name: 'Sam', likes: ['kiwi'] });
    const result = scoreRecipe(dish, ctx({ attendees: [sam] }));
    expect(reasonText(result, 'Sam likes kiwi')).toEqual({ text: 'Sam likes kiwi', delta: 8 });
  });
});

describe('scoreRecipe — kid-friendly', () => {
  it('adds +8 when an attendee is a child and the recipe is tagged kid-friendly', () => {
    const dish = recipe({ tags: ['kid-friendly'] });
    const kid = member({ name: 'Ada', ageGroup: 'child' });
    const result = scoreRecipe(dish, ctx({ attendees: [kid] }));
    expect(reasonText(result, 'Kid-friendly for Ada')).toEqual({ text: 'Kid-friendly for Ada', delta: 8 });
  });

  it('does not apply when nobody attending is a baby/toddler/child', () => {
    const dish = recipe({ tags: ['kid-friendly'] });
    const adult = member({ ageGroup: 'adult' });
    const result = scoreRecipe(dish, ctx({ attendees: [adult] }));
    expect(result!.reasons.some((r) => r.text.startsWith('Kid-friendly'))).toBe(false);
  });

  it('does not apply when the recipe is not tagged kid-friendly, even with a toddler attending', () => {
    const dish = recipe({ tags: [] });
    const toddler = member({ ageGroup: 'toddler' });
    const result = scoreRecipe(dish, ctx({ attendees: [toddler] }));
    expect(result!.reasons.some((r) => r.text.startsWith('Kid-friendly'))).toBe(false);
  });
});

describe('scoreRecipe — variety (same dish recently)', () => {
  function historyEntry(serviceDate: string): HistoryEntry {
    return { serviceDate, slot: 'dinner', status: 'plated', recipeId: 1, recipeName: 'Test Dish', protein: 'veg' };
  }

  it('day 3 (within 7 days) subtracts 80', () => {
    const result = scoreRecipe(recipe(), ctx({ date: '2026-09-23', history: [historyEntry('2026-09-20')] }));
    const r = result!.reasons.find((x) => x.text.startsWith('Had it on'));
    expect(r).toEqual({ text: 'Had it on Sunday', delta: -80 });
  });

  it('day 10 (8-14 days) subtracts 40', () => {
    const result = scoreRecipe(recipe(), ctx({ date: '2026-09-23', history: [historyEntry('2026-09-13')] }));
    const r = result!.reasons.find((x) => x.text.startsWith('Had it on'));
    expect(r?.delta).toBe(-40);
  });

  it('day 18 (15-21 days) subtracts 15', () => {
    const result = scoreRecipe(recipe(), ctx({ date: '2026-09-23', history: [historyEntry('2026-09-05')] }));
    const r = result!.reasons.find((x) => x.text.startsWith('Had it on'));
    expect(r?.delta).toBe(-15);
  });

  it('beyond 21 days: no variety penalty', () => {
    const result = scoreRecipe(recipe(), ctx({ date: '2026-09-23', history: [historyEntry('2026-08-01')] }));
    expect(result!.reasons.some((x) => x.text.startsWith('Had it on'))).toBe(false);
  });

  it('an eightysixed history entry does not count towards variety', () => {
    const result = scoreRecipe(
      recipe(),
      ctx({ date: '2026-09-23', history: [{ ...historyEntry('2026-09-20'), status: 'eightysixed' }] })
    );
    expect(result!.reasons.some((x) => x.text.startsWith('Had it on'))).toBe(false);
  });

  it('a different recipe id in history does not trigger the penalty', () => {
    const result = scoreRecipe(
      recipe({ id: 1 }),
      ctx({ date: '2026-09-23', history: [{ ...historyEntry('2026-09-20'), recipeId: 2 }] })
    );
    expect(result!.reasons.some((x) => x.text.startsWith('Had it on'))).toBe(false);
  });
});

describe('scoreRecipe — protein alternation', () => {
  const chickenDish = recipe({
    id: 10,
    name: 'Chicken Curry',
    ingredients: [{ name: 'chicken breast', aisle: 'meat-fish', allergens: [], optional: false }],
  });
  const vegDish = recipe({ id: 11, name: 'Veg Chilli', ingredients: [{ name: 'kidney beans', aisle: 'pantry', allergens: [], optional: false }] });

  function yesterdayChicken(): HistoryEntry {
    return { serviceDate: '2026-09-22', slot: 'dinner', status: 'plated', recipeId: 20, recipeName: 'Chicken Fajitas', protein: 'chicken' };
  }

  it('subtracts 10 when the same primary protein was served the previous day in the same slot', () => {
    const result = scoreRecipe(chickenDish, ctx({ date: '2026-09-23', slot: 'dinner', history: [yesterdayChicken()] }));
    expect(reasonText(result, "Chicken again after yesterday's chicken fajitas")).toEqual({
      text: "Chicken again after yesterday's chicken fajitas",
      delta: -10,
    });
  });

  it('does not penalise a different protein the next day', () => {
    const beefDish = recipe({ id: 12, name: 'Beef Stew', ingredients: [{ name: 'beef mince', aisle: 'meat-fish', allergens: [], optional: false }] });
    const result = scoreRecipe(beefDish, ctx({ date: '2026-09-23', slot: 'dinner', history: [yesterdayChicken()] }));
    expect(result!.reasons.some((r) => r.text.includes('again after yesterday'))).toBe(false);
  });

  it('does not penalise the same protein when yesterday\'s entry was a DIFFERENT slot', () => {
    // yesterdayChicken() was dinner — score this recipe for lunch instead, so
    // the "previous day, SAME slot" condition is false even though the
    // protein and the date both match.
    const lunchChicken = recipe({ ...chickenDish, mealTypes: ['lunch'] });
    const result = scoreRecipe(lunchChicken, ctx({ date: '2026-09-23', slot: 'lunch', history: [yesterdayChicken()] }));
    expect(result!.reasons.some((r) => r.text.includes('again after yesterday'))).toBe(false);
  });

  it('vegetarian dishes ("veg" protein) are exempt from the alternation penalty', () => {
    const yesterdayVeg: HistoryEntry = { serviceDate: '2026-09-22', slot: 'dinner', status: 'plated', recipeId: 30, recipeName: 'Lentil Soup', protein: 'veg' };
    const result = scoreRecipe(vegDish, ctx({ date: '2026-09-23', slot: 'dinner', history: [yesterdayVeg] }));
    expect(result!.reasons.some((r) => r.text.includes('again after yesterday'))).toBe(false);
  });

  it('two days ago (not yesterday) does not trigger the alternation penalty', () => {
    const twoDaysAgo: HistoryEntry = { ...yesterdayChicken(), serviceDate: '2026-09-21' };
    const result = scoreRecipe(chickenDish, ctx({ date: '2026-09-23', slot: 'dinner', history: [twoDaysAgo] }));
    expect(result!.reasons.some((r) => r.text.includes('again after yesterday'))).toBe(false);
  });
});

describe('scoreRecipe — effort fit', () => {
  // QA (Slice 3, second pass): "school night" = the evening before a school
  // day, i.e. Sunday through Thursday — NOT the ordinary Mon-Fri weekday
  // definition. Friday and Saturday dinners are exempt even though Friday is
  // technically a weekday; Sunday IS included even though it isn't.
  it('a school-night (Sun-Thu) dinner over 45 minutes subtracts 10 ("Long cook for a school night")', () => {
    const longDish = recipe({ prepMinutes: 20, cookMinutes: 30 });
    const result = scoreRecipe(longDish, ctx({ date: '2026-09-23', slot: 'dinner' })); // Wednesday
    expect(reasonText(result, 'Long cook for a school night')).toEqual({ text: 'Long cook for a school night', delta: -10 });
  });

  it('applies the school-night penalty on SUNDAY (the evening before Monday)', () => {
    const longDish = recipe({ prepMinutes: 20, cookMinutes: 30 });
    const result = scoreRecipe(longDish, ctx({ date: '2026-09-27', slot: 'dinner' })); // Sunday
    expect(reasonText(result, 'Long cook for a school night')).toEqual({ text: 'Long cook for a school night', delta: -10 });
  });

  it('does NOT penalise a long cook on Friday, even though Friday is an ordinary weekday', () => {
    const longDish = recipe({ prepMinutes: 20, cookMinutes: 30 });
    const result = scoreRecipe(longDish, ctx({ date: '2026-09-25', slot: 'dinner' })); // Friday
    expect(result!.reasons.some((r) => r.text === 'Long cook for a school night')).toBe(false);
  });

  it('does not penalise a long cook on Saturday', () => {
    const longDish = recipe({ prepMinutes: 20, cookMinutes: 30 });
    const result = scoreRecipe(longDish, ctx({ date: '2026-09-26', slot: 'dinner' })); // Saturday
    expect(result!.reasons.some((r) => r.text === 'Long cook for a school night')).toBe(false);
  });

  it('does not penalise a long cook outside dinner', () => {
    const longDish = recipe({ prepMinutes: 20, cookMinutes: 30, mealTypes: ['lunch'] });
    const result = scoreRecipe(longDish, ctx({ date: '2026-09-23', slot: 'lunch' }));
    expect(result!.reasons.some((r) => r.text === 'Long cook for a school night')).toBe(false);
  });

  it('adds +10 for a Sunday-tagged dish on a Sunday', () => {
    const sundayDish = recipe({ tags: ['sunday'] });
    const result = scoreRecipe(sundayDish, ctx({ date: '2026-09-27', slot: 'dinner' })); // Sunday
    expect(reasonText(result, 'A proper Sunday dish')).toEqual({ text: 'A proper Sunday dish', delta: 10 });
  });

  // Slice 4 carry-over fix: a roast is the whole point of Sunday, so a
  // 'sunday'-tagged dish is exempt from the long-cook penalty on Sunday —
  // even though it's well over 45 minutes and Sunday otherwise counts as a
  // school night (the evening before Monday).
  it('exempts a Sunday-tagged long cook from the school-night penalty on Sunday', () => {
    const sundayRoast = recipe({ tags: ['sunday'], prepMinutes: 30, cookMinutes: 90 });
    const result = scoreRecipe(sundayRoast, ctx({ date: '2026-09-27', slot: 'dinner' })); // Sunday
    expect(result!.reasons.some((r) => r.text === 'Long cook for a school night')).toBe(false);
    expect(reasonText(result, 'A proper Sunday dish')).toEqual({ text: 'A proper Sunday dish', delta: 10 });
  });

  // A long cook NOT tagged 'sunday' still gets the penalty on Sunday — the
  // exemption is specific to the "sunday" tag, not to the day itself.
  it('still penalises a long cook on Sunday when the dish is NOT tagged sunday', () => {
    const longDish = recipe({ prepMinutes: 30, cookMinutes: 90 });
    const result = scoreRecipe(longDish, ctx({ date: '2026-09-27', slot: 'dinner' })); // Sunday
    expect(reasonText(result, 'Long cook for a school night')).toEqual({ text: 'Long cook for a school night', delta: -10 });
  });

  it('adds +5 for a quick-tagged dish on a weekday', () => {
    const quickDish = recipe({ tags: ['quick'] });
    const result = scoreRecipe(quickDish, ctx({ date: '2026-09-23', slot: 'dinner' })); // Wednesday
    expect(reasonText(result, 'Quick enough for a weeknight')).toEqual({ text: 'Quick enough for a weeknight', delta: 5 });
  });

  it('adds +4 for a comfort-tagged dish on a Friday', () => {
    const comfortDish = recipe({ tags: ['comfort'] });
    const result = scoreRecipe(comfortDish, ctx({ date: '2026-09-25', slot: 'dinner' })); // Friday
    expect(reasonText(result, 'A weekend kind of dish')).toEqual({ text: 'A weekend kind of dish', delta: 4 });
  });

  it('adds +4 for a bbq-tagged dish on a Saturday', () => {
    const bbqDish = recipe({ tags: ['bbq'] });
    const result = scoreRecipe(bbqDish, ctx({ date: '2026-09-26', slot: 'dinner' })); // Saturday
    expect(reasonText(result, 'A weekend kind of dish')).toEqual({ text: 'A weekend kind of dish', delta: 4 });
  });
});

describe('scoreRecipe — favourite and untested', () => {
  it('adds +6 for a favourite', () => {
    const result = scoreRecipe(recipe({ favourite: true }), ctx());
    expect(reasonText(result, 'A house favourite')).toEqual({ text: 'A house favourite', delta: 6 });
  });

  it('adds +3 ("Nobody\'s tried it yet") when no attendee has ever rated it', () => {
    const result = scoreRecipe(recipe(), ctx({ ratings: [] }));
    expect(reasonText(result, "Nobody's tried it yet")).toEqual({ text: "Nobody's tried it yet", delta: 3 });
  });

  it('does not add the untested bonus once an attendee has rated it', () => {
    const ratings: EngineRating[] = [{ recipeId: 1, memberId: 1, verdict: 'clean', ratedAt: '2026-09-01T00:00:00Z' }];
    const result = scoreRecipe(recipe(), ctx({ ratings }));
    expect(result!.reasons.some((r) => r.text === "Nobody's tried it yet")).toBe(false);
  });
});

describe('reasons are sorted by absolute delta, headline first', () => {
  it('puts the largest-magnitude reason first', () => {
    const dish = recipe({ favourite: true, tags: ['quick'] }); // +6, +5
    const history: HistoryEntry[] = [{ serviceDate: '2026-09-20', slot: 'dinner', status: 'plated', recipeId: 1, recipeName: 'Test Dish', protein: 'veg' }];
    const result = scoreRecipe(dish, ctx({ date: '2026-09-23', history })); // -80 variety penalty dwarfs the rest
    expect(result!.reasons[0].text).toBe('Had it on Sunday');
    expect(Math.abs(result!.reasons[0].delta)).toBeGreaterThanOrEqual(Math.abs(result!.reasons[1]?.delta ?? 0));
  });

  // Slice 4 carry-over fix: when two reasons tie on |delta| (a 'sunday'-tagged
  // roast on Sunday gets +10 "A proper Sunday dish"; if its protein also
  // matches yesterday's same-slot dish, protein alternation gets -10) the
  // headline should be the encouraging one, not the apologetic one.
  it('prefers the positive reason when two reasons tie on absolute delta', () => {
    const chickenSundayRoast = recipe({
      tags: ['sunday'],
      ingredients: [{ name: 'whole chicken', aisle: 'meat-fish', allergens: [], optional: false }],
    });
    const yesterday: HistoryEntry = {
      serviceDate: '2026-09-26', // Saturday
      slot: 'dinner',
      status: 'planned',
      recipeId: 99,
      recipeName: 'Chicken Fajitas',
      protein: 'chicken',
    };
    const result = scoreRecipe(
      chickenSundayRoast,
      ctx({ date: '2026-09-27', slot: 'dinner', history: [yesterday] }) // Sunday
    );
    const sundayReason = reasonText(result, 'A proper Sunday dish');
    const proteinReason = result!.reasons.find((r) => r.text.includes('again after yesterday'));
    expect(sundayReason).toEqual({ text: 'A proper Sunday dish', delta: 10 });
    expect(proteinReason?.delta).toBe(-10);
    expect(result!.reasons[0].text).toBe('A proper Sunday dish');
  });
});

describe('jitter — deterministic ±3 from seed + recipe id', () => {
  it('is always within -3..3', () => {
    for (let id = 1; id <= 50; id++) {
      const value = jitter('some-seed', id);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(3);
    }
  });

  it('is identical across repeated calls with the same seed and id', () => {
    expect(jitter('seed-a', 42)).toBe(jitter('seed-a', 42));
    expect(jitter('seed-a', 42)).toBe(jitter('seed-a', 42));
  });

  it('scoreRecipe is deterministic: same seed -> same score, called twice', () => {
    const dish = recipe();
    const a = scoreRecipe(dish, ctx({ seed: 'repeat-me' }));
    const b = scoreRecipe(dish, ctx({ seed: 'repeat-me' }));
    expect(a!.score).toBe(b!.score);
  });

  it('a different seed can change the score (jitter differs for at least one id in a spread of seeds)', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => `seed-${i}`);
    const values = new Set(seeds.map((seed) => jitter(seed, 7)));
    expect(values.size).toBeGreaterThan(1);
  });
});
