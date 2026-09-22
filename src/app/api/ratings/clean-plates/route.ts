import { NextResponse } from 'next/server';
import { fetchCleanPlatesByMember } from '@/lib/ratings-db';

// GET /api/ratings/clean-plates — { [memberId]: { recipeId, recipeName }[] }
// (up to 3 each), powering The Table's "CLEAN PLATES" row. See
// docs/slices/03-engine.md's Screens section and its Build notes for why
// this sits outside the spec's literal /api/ratings?recipe_id= shape.
export async function GET() {
  const byMember = await fetchCleanPlatesByMember();
  const result: Record<number, { recipeId: number; recipeName: string }[]> = {};
  for (const [memberId, plates] of byMember) result[memberId] = plates;
  return NextResponse.json(result);
}
