import { ensureDb } from '@/lib/db';
import { getSuggestions } from '@/lib/suggestions';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const familyCode = req.nextUrl.searchParams.get('familyCode');
  if (!familyCode) return NextResponse.json({ error: 'familyCode required' }, { status: 400 });
  const mealType = req.nextUrl.searchParams.get('mealType') || undefined;
  const sql = await ensureDb();
  const members = await sql`SELECT * FROM fm_members WHERE family_code = ${familyCode}`;
  const suggestions = getSuggestions(members as any[], mealType);
  return NextResponse.json(suggestions);
}

