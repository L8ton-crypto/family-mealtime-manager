import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { createMemberSchema } from '@/lib/members-schema';

export async function GET() {
  const members = await sql`
    SELECT id, name, age_group, colour, likes, dislikes, restrictions, allergies, sort_order, created_at
    FROM fm_members
    ORDER BY sort_order ASC, id ASC
  `;
  return NextResponse.json(members);
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = createMemberSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }

  const { name, age_group, colour, likes, dislikes, restrictions, allergies } = parsed.data;

  const [member] = await sql`
    INSERT INTO fm_members (name, age_group, colour, likes, dislikes, restrictions, allergies, sort_order)
    VALUES (
      ${name},
      ${age_group},
      ${colour},
      ${JSON.stringify(likes)}::jsonb,
      ${JSON.stringify(dislikes)}::jsonb,
      ${JSON.stringify(restrictions)}::jsonb,
      ${JSON.stringify(allergies)}::jsonb,
      (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM fm_members)
    )
    RETURNING id, name, age_group, colour, likes, dislikes, restrictions, allergies, sort_order, created_at
  `;

  return NextResponse.json(member, { status: 201 });
}
