import { NextRequest, NextResponse } from 'next/server';
import { fetchPlanHistory } from '@/lib/plan-db';

export async function GET(req: NextRequest) {
  const limitParam = req.nextUrl.searchParams.get('limit');
  const parsedLimit = limitParam ? Number(limitParam) : 50;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 200) : 50;

  const entries = await fetchPlanHistory(limit);
  return NextResponse.json(entries);
}
