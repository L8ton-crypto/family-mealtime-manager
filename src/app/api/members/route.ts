import { ensureDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const familyCode = req.nextUrl.searchParams.get('familyCode');
  if (!familyCode) return NextResponse.json({ error: 'familyCode required' }, { status: 400 });
  const sql = await ensureDb();
  const members = await sql`SELECT * FROM fm_members WHERE family_code = ${familyCode} ORDER BY created_at ASC`;
  return NextResponse.json(members);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { familyCode, name, ageGroup, avatarColor, likes, dislikes, restrictions, allergies } = body;
  if (!familyCode || !name) return NextResponse.json({ error: 'familyCode and name required' }, { status: 400 });
  const sql = await ensureDb();
  const result = await sql`INSERT INTO fm_members (family_code, name, age_group, avatar_color, likes, dislikes, restrictions, allergies) VALUES (${familyCode}, ${name}, ${ageGroup || 'adult'}, ${avatarColor || '#6366f1'}, ${likes || []}, ${dislikes || []}, ${restrictions || []}, ${allergies || []}) RETURNING *`;
  return NextResponse.json(result[0], { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, ageGroup, avatarColor, likes, dislikes, restrictions, allergies } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sql = await ensureDb();
  const result = await sql`UPDATE fm_members SET name = COALESCE(${name}, name), age_group = COALESCE(${ageGroup}, age_group), avatar_color = COALESCE(${avatarColor}, avatar_color), likes = COALESCE(${likes}, likes), dislikes = COALESCE(${dislikes}, dislikes), restrictions = COALESCE(${restrictions}, restrictions), allergies = COALESCE(${allergies}, allergies) WHERE id = ${id} RETURNING *`;
  if (result.length === 0) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  return NextResponse.json(result[0]);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sql = await ensureDb();
  await sql`DELETE FROM fm_members WHERE id = ${parseInt(id)}`;
  return NextResponse.json({ success: true });
}

