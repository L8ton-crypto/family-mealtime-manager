// Proposes a whole week (or however many day/slot pairs are asked for) in
// one pass. Pure — no DB access. See docs/slices/03-engine.md, "fillWeek".

import { primaryProtein } from './protein';
import {
  scoreRecipe,
  type EngineMember,
  type EngineRating,
  type EngineRecipe,
  type HistoryEntry,
  type Reason,
  type ScoreResult,
} from './score';
import type { MealType } from '../vocab';

/** One entry a (day, slot) already carries, as much as fillWeek needs to decide whether to skip/replace it. */
export interface ExistingSlotEntry {
  day: string;
  slot: MealType;
  entryId: number;
  name: string;
  status: 'planned' | 'plated' | 'eightysixed';
}

export interface FillParams {
  /** In date order — the day/slot pairs are proposed in this order, so each day's scoring can see every earlier day's own proposal. */
  days: string[];
  slots: MealType[];
  /**
   * The caller's (client's) own "today", YYYY-MM-DD — see
   * docs/slices/04-order.md's carry-over fixes. Any entry in `days` that
   * falls strictly before this is skipped entirely (not even a `gap`
   * proposal): Fire the week must never propose a dish for a day that's
   * already in the past, no matter what week is being planned. The route
   * validates and forwards the CLIENT's local date here rather than trusting
   * server time, so a household past midnight UTC still sees their own today.
   */
  today: string;
  recipes: EngineRecipe[];
  members: EngineMember[];
  /** Household member ids who attend every new proposal (the pass's "covers" toggle). */
  attendeesByDefault: number[];
  /** Last 21 days plus the week being planned — see ScoreContext. Should already include any entries `existing` also lists. */
  history: HistoryEntry[];
  ratings: EngineRating[];
  seed: string;
  /**
   * true: a (day, slot) already carrying ANY entry (any status) is left
   * alone entirely — no proposal.
   * false ("REPLACE"): a slot occupied only by `planned` entries still gets
   * proposed, and that proposal's `replaces` lists what it would replace.
   * A slot occupied by a `plated` or `eightysixed` entry is ALWAYS skipped
   * regardless of this flag — those are never replaced. See
   * docs/slices/03-engine.md's Build notes (QA, second pass) for the full
   * product decision.
   */
  keepExisting: boolean;
  existing: ExistingSlotEntry[];
}

export interface Alternative {
  recipeId: number;
  score: number;
  headline: string;
}

export interface Replaces {
  entryId: number;
  name: string;
}

export type Proposal =
  | {
      day: string;
      slot: MealType;
      recipeId: number;
      score: number;
      headline: string;
      reasons: Reason[];
      alternatives: Alternative[];
      /** The planned entries this proposal would replace if fired — only present when keepExisting is false and the slot held planned entries. */
      replaces?: Replaces[];
      gap?: undefined;
    }
  | {
      day: string;
      slot: MealType;
      gap: string;
      recipeId?: undefined;
    };

/**
 * Proposes a dish for every (day, slot) pair not fully covered — sequentially,
 * in date order, so variety and protein alternation apply within this run's
 * own proposals, not just against pre-existing history. Never proposes the
 * same recipe twice in one run. Emits a `gap` entry (no recipeId) when
 * nothing scores above 0.
 */
export function fillWeek(params: FillParams): Proposal[] {
  const proposals: Proposal[] = [];
  const usedRecipeIds = new Set<number>();
  let runningHistory = [...params.history];

  const attendees = params.members.filter((m) => params.attendeesByDefault.includes(m.id));

  // A day strictly before "today" is skipped entirely — no proposal, not
  // even a gap. See the FillParams.today doc comment.
  const days = params.days.filter((day) => day >= params.today);

  for (const day of days) {
    for (const slot of params.slots) {
      const slotExisting = params.existing.filter((e) => e.day === day && e.slot === slot);

      // A plated or eightysixed entry is never replaced, and makes the
      // whole slot off-limits — regardless of keepExisting.
      const hasProtected = slotExisting.some((e) => e.status === 'plated' || e.status === 'eightysixed');
      if (hasProtected) continue;

      const plannedExisting = slotExisting.filter((e) => e.status === 'planned');
      if (params.keepExisting && plannedExisting.length > 0) continue;

      const candidates = params.recipes.filter((r) => !usedRecipeIds.has(r.id));
      const scored = candidates
        .map((recipe) => ({ recipe, result: scoreRecipe(recipe, { date: day, slot, attendees, history: runningHistory, ratings: params.ratings, seed: params.seed }) }))
        .filter((x): x is { recipe: EngineRecipe; result: ScoreResult } => x.result !== null)
        .sort((a, b) => b.result.score - a.result.score);

      if (scored.length === 0 || scored[0].result.score <= 0) {
        proposals.push({ day, slot, gap: 'No safe dish for these covers' });
        continue;
      }

      const best = scored[0];
      const alternatives: Alternative[] = scored.slice(1, 5).map((s) => ({
        recipeId: s.recipe.id,
        score: s.result.score,
        headline: s.result.reasons[0]?.text ?? '',
      }));

      proposals.push({
        day,
        slot,
        recipeId: best.recipe.id,
        score: best.result.score,
        headline: best.result.reasons[0]?.text ?? '',
        reasons: best.result.reasons,
        alternatives,
        ...(plannedExisting.length > 0
          ? { replaces: plannedExisting.map((e) => ({ entryId: e.entryId, name: e.name })) }
          : {}),
      });

      usedRecipeIds.add(best.recipe.id);
      runningHistory = [
        ...runningHistory,
        {
          serviceDate: day,
          slot,
          status: 'planned',
          recipeId: best.recipe.id,
          recipeName: best.recipe.name,
          protein: primaryProtein(best.recipe.ingredients),
        },
      ];
    }
  }

  return proposals;
}
