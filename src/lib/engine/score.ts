// The heart of Slice 3: scores one recipe for one service, and explains why
// in plain sentences a human wrote. Pure — no DB access. See
// docs/slices/03-engine.md, "The engine".

import { compatibility, type CompatMember } from './compat';
import { primaryProtein, type Protein, type ProteinIngredientLike } from './protein';
import { addDays, daysBetween, formatWeekdayLong } from '../dates';
import { wordBoundaryMatch } from '../textMatch';
import type { Aisle, Allergen, MealType, Verdict } from '../vocab';
import type { AgeGroup } from '../members-schema';

export interface EngineIngredient extends ProteinIngredientLike {
  aisle: Aisle;
  allergens: Allergen[];
}

export interface EngineRecipe {
  id: number;
  name: string;
  tags: string[];
  mealTypes: MealType[];
  ingredients: EngineIngredient[];
  prepMinutes: number;
  cookMinutes: number;
  favourite: boolean;
  archived: boolean;
}

export interface EngineMember {
  id: number;
  name: string;
  ageGroup: AgeGroup;
  likes: string[];
  dislikes: string[];
  restrictions: string[];
  allergies: string[];
}

/** One prior (or already-proposed-this-run) service, as much as the engine needs to reason about variety and protein alternation — never a DB row. */
export interface HistoryEntry {
  serviceDate: string;
  slot: MealType;
  status: 'planned' | 'plated' | 'eightysixed';
  recipeId: number | null;
  recipeName: string;
  /** Precomputed by the caller via primaryProtein() — null when there's no recipe (a custom entry like "Takeaway"). */
  protein: Protein | null;
}

export interface EngineRating {
  recipeId: number;
  memberId: number;
  verdict: Verdict;
  /** ISO timestamp (or any lexically-sortable string) — used only to find the most recent verdicts. */
  ratedAt: string;
}

export interface ScoreContext {
  date: string;
  slot: MealType;
  attendees: EngineMember[];
  /** Last 21 days, PLUS the week being planned (so a same-week proposal can still be seen by a later day's scoring) — see fill.ts. */
  history: HistoryEntry[];
  ratings: EngineRating[];
  seed: string;
}

export interface Reason {
  text: string;
  delta: number;
}

export interface ScoreResult {
  score: number;
  reasons: Reason[];
}

const VERDICT_POINTS: Record<Verdict, number> = { clean: 12, half: 2, left: -15 };
const KID_AGE_GROUPS: AgeGroup[] = ['baby', 'toddler', 'child'];

function toCompatMember(member: EngineMember): CompatMember {
  return { id: member.id, name: member.name, restrictions: member.restrictions, allergies: member.allergies };
}

function countWord(n: number): string {
  if (n === 2) return 'twice';
  if (n === 3) return 'three times';
  if (n === 4) return 'four times';
  return `${n} times`;
}

/**
 * Human summary of a member's most recent (up to 3) verdicts for a dish,
 * most-recent first. A single verdict reads as "...last time"; several of
 * the SAME verdict count ("...twice", "...three times"); a mixed set falls
 * back to describing just the most recent one, since "clean, then left,
 * then half" has no single honest one-line summary.
 */
function verdictReason(memberName: string, recentVerdicts: Verdict[]): string {
  const phrase = (verdict: Verdict, suffix: string): string => {
    if (verdict === 'clean') return `${memberName}'s plate came back clean ${suffix}`;
    if (verdict === 'half') return `${memberName} only ate half ${suffix}`;
    return `${memberName} left it ${suffix}`;
  };
  if (recentVerdicts.length === 1) return phrase(recentVerdicts[0], 'last time');
  const allSame = recentVerdicts.every((v) => v === recentVerdicts[0]);
  if (allSame) return phrase(recentVerdicts[0], countWord(recentVerdicts.length));
  return phrase(recentVerdicts[0], 'last time');
}

function hashString(value: string): number {
  // FNV-1a — small, fast, and deterministic across runs/environments, which
  // is all "jitter" needs: the same seed + recipe id always hashes to the
  // same bucket.
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic -3..+3 jitter from seed + recipe id. Not a Reason — see docs/slices/03-engine.md. */
export function jitter(seed: string, recipeId: number): number {
  return (hashString(`${seed}:${recipeId}`) % 7) - 3;
}

function weekdayIndex(iso: string): number {
  // 0 = Sunday .. 6 = Saturday, matching Date#getUTCDay's convention —
  // derived from formatWeekdayLong rather than re-implementing UTC date
  // maths a third time in this codebase.
  const full = formatWeekdayLong(iso);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(full);
}

/**
 * Scores one recipe for one service and explains every point. Returns null
 * for a hard filter (archived, wrong meal type, unsafe for these
 * attendees) — such a recipe is never suggested, not just penalised.
 */
export function scoreRecipe(recipe: EngineRecipe, ctx: ScoreContext): ScoreResult | null {
  if (recipe.archived) return null;
  if (!recipe.mealTypes.includes(ctx.slot)) return null;

  const compatMembers = ctx.attendees.map(toCompatMember);
  const compat = compatibility({ tags: recipe.tags, ingredients: recipe.ingredients }, compatMembers);
  if (!compat.safe) return null;

  const reasons: Reason[] = [];
  let score = 50;

  // Plate history per attendee — recency-weighted (most recent verdict
  // weighted 3, then 2, then 1), one Reason per member who has ever rated
  // this dish.
  for (const member of ctx.attendees) {
    const memberRatings = ctx.ratings
      .filter((r) => r.recipeId === recipe.id && r.memberId === member.id)
      .sort((a, b) => (a.ratedAt < b.ratedAt ? 1 : a.ratedAt > b.ratedAt ? -1 : 0))
      .slice(0, 3);
    if (memberRatings.length === 0) continue;
    const weights = [3, 2, 1].slice(0, memberRatings.length);
    const weightSum = weights.reduce((s, w) => s + w, 0);
    const weightedSum = memberRatings.reduce((s, r, i) => s + VERDICT_POINTS[r.verdict] * weights[i], 0);
    const delta = Math.round(weightedSum / weightSum);
    score += delta;
    reasons.push({ text: verdictReason(member.name, memberRatings.map((r) => r.verdict)), delta });
  }

  // Likes and dislikes — matched against the dish's name, tags and
  // ingredient names.
  const haystack = `${recipe.name} ${recipe.tags.join(' ')} ${recipe.ingredients.map((i) => i.name).join(' ')}`;
  for (const member of ctx.attendees) {
    for (const like of member.likes) {
      if (wordBoundaryMatch(haystack, like)) {
        score += 8;
        reasons.push({ text: `${member.name} likes ${like}`, delta: 8 });
      }
    }
    for (const dislike of member.dislikes) {
      if (wordBoundaryMatch(haystack, dislike)) {
        score -= 12;
        reasons.push({ text: `${member.name} dislikes ${dislike}`, delta: -12 });
      }
    }
  }

  // Kid-friendly.
  const kidAttendee = ctx.attendees.find((m) => KID_AGE_GROUPS.includes(m.ageGroup));
  if (kidAttendee && recipe.tags.includes('kid-friendly')) {
    score += 8;
    reasons.push({ text: `Kid-friendly for ${kidAttendee.name}`, delta: 8 });
  }

  // Variety — same dish recently, by distance in EITHER direction (a
  // same-week proposal made earlier in this fillWeek run can sit either
  // side of `ctx.date` in the extended history array).
  const priorOccurrences = ctx.history.filter(
    (h) => h.recipeId === recipe.id && h.status !== 'eightysixed' && !(h.serviceDate === ctx.date && h.slot === ctx.slot)
  );
  if (priorOccurrences.length > 0) {
    let closest = priorOccurrences[0];
    let closestDistance = Math.abs(daysBetween(closest.serviceDate, ctx.date));
    for (const occurrence of priorOccurrences) {
      const distance = Math.abs(daysBetween(occurrence.serviceDate, ctx.date));
      if (distance < closestDistance) {
        closest = occurrence;
        closestDistance = distance;
      }
    }
    const dayName = formatWeekdayLong(closest.serviceDate);
    if (closestDistance <= 7) {
      score -= 80;
      reasons.push({ text: `Had it on ${dayName}`, delta: -80 });
    } else if (closestDistance <= 14) {
      score -= 40;
      reasons.push({ text: `Had it on ${dayName}`, delta: -40 });
    } else if (closestDistance <= 21) {
      score -= 15;
      reasons.push({ text: `Had it on ${dayName}`, delta: -15 });
    }
  }

  // Protein alternation — same primary protein as the previous day's SAME
  // slot. Vegetarian dishes ('veg') are exempt.
  const protein = primaryProtein(recipe.ingredients);
  if (protein !== 'veg') {
    const yesterday = addDays(ctx.date, -1);
    const yesterdaySameSlot = ctx.history.find(
      (h) => h.serviceDate === yesterday && h.slot === ctx.slot && h.status !== 'eightysixed' && h.protein !== null
    );
    if (yesterdaySameSlot && yesterdaySameSlot.protein === protein) {
      score -= 10;
      const proteinLabel = protein.charAt(0).toUpperCase() + protein.slice(1);
      reasons.push({
        text: `${proteinLabel} again after yesterday's ${yesterdaySameSlot.recipeName.toLowerCase()}`,
        delta: -10,
      });
    }
  }

  // Effort fit.
  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;
  const weekday = weekdayIndex(ctx.date); // 0 Sun .. 6 Sat
  const isWeekday = weekday >= 1 && weekday <= 5;
  const isSunday = weekday === 0;
  const isFriOrSat = weekday === 5 || weekday === 6;
  // QA (Slice 3, second pass): "school night" means the evening before a
  // school day, which is Sunday through Thursday (Sunday evening precedes
  // Monday) — Friday and Saturday dinners are exempt, even though Friday is
  // technically a weekday.
  const isSchoolNight = weekday <= 4; // Sun .. Thu

  // QA (Slice 4 carry-over): a recipe tagged 'sunday' served ON Sunday is
  // exempt from the long-cook penalty entirely — a roast taking well over 45
  // minutes is the whole point of Sunday, not a school-night mistake. This is
  // a genuine exemption (the -10 never applies), not just an offsetting +10
  // bonus that happens to cancel it out.
  const isSundayRoast = isSunday && recipe.tags.includes('sunday');
  if (ctx.slot === 'dinner' && isSchoolNight && totalMinutes > 45 && !isSundayRoast) {
    score -= 10;
    reasons.push({ text: 'Long cook for a school night', delta: -10 });
  }
  if (isSundayRoast) {
    score += 10;
    reasons.push({ text: 'A proper Sunday dish', delta: 10 });
  }
  if (isWeekday && recipe.tags.includes('quick')) {
    score += 5;
    reasons.push({ text: 'Quick enough for a weeknight', delta: 5 });
  }
  if (isFriOrSat && (recipe.tags.includes('comfort') || recipe.tags.includes('bbq'))) {
    score += 4;
    reasons.push({ text: 'A weekend kind of dish', delta: 4 });
  }

  // Favourite.
  if (recipe.favourite) {
    score += 6;
    reasons.push({ text: 'A house favourite', delta: 6 });
  }

  // Untested — no attendee has ever rated it.
  const everRated = ctx.attendees.some((m) => ctx.ratings.some((r) => r.recipeId === recipe.id && r.memberId === m.id));
  if (!everRated) {
    score += 3;
    reasons.push({ text: "Nobody's tried it yet", delta: 3 });
  }

  // Jitter — not a Reason.
  score += jitter(ctx.seed, recipe.id);

  // Sorted by impact, biggest first. When two reasons tie on absolute delta
  // (e.g. "A proper Sunday dish" +10 vs "Chicken again after yesterday's..."
  // -10), the headline (reasons[0]) should read as encouraging rather than
  // apologetic — so ties prefer the positive delta over the negative one.
  reasons.sort((a, b) => {
    const byMagnitude = Math.abs(b.delta) - Math.abs(a.delta);
    return byMagnitude !== 0 ? byMagnitude : b.delta - a.delta;
  });

  return { score, reasons };
}
