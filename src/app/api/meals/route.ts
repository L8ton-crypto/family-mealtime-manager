import { ensureDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const familyCode = req.nextUrl.searchParams.get('familyCode');
  if (!familyCode) return NextResponse.json({ error: 'familyCode required' }, { status: 400 });
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20');
  const sql = await ensureDb();
  const meals = await sql`SELECT * FROM fm_meals WHERE family_code = ${familyCode} ORDER BY meal_date DESC, created_at DESC LIMIT ${limit}`;
  return NextResponse.json(meals);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { familyCode, name, mealType, date, rating, notes } = body;
  if (!familyCode || !name) return NextResponse.json({ error: 'familyCode and name required' }, { status: 400 });
  const sql = await ensureDb();
  const result = await sql`INSERT INTO fm_meals (family_code, name, meal_type, meal_date, rating, notes) VALUES (${familyCode}, ${name}, ${mealType || 'dinner'}, ${date || new Date().toISOString().split('T')[0]}, ${rating || null}, ${notes || null}) RETURNING *`;
  return NextResponse.json(result[0], { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sql = await ensureDb();
  await sql`DELETE FROM fm_meals WHERE id = ${parseInt(id)}`;
  return NextResponse.json({ success: true });
}

