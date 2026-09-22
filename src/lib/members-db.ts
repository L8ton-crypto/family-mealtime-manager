import { sql } from './db';
import type { EngineMember } from './engine/score';

/** Every household member, shaped for the engine (id, name, age group, likes/dislikes/restrictions/allergies). */
export async function fetchAllMembersForEngine(): Promise<EngineMember[]> {
  const rows = await sql`
    SELECT id, name, age_group, likes, dislikes, restrictions, allergies
    FROM fm_members
    ORDER BY sort_order ASC, id ASC
  `;
  return (rows as { id: number; name: string; age_group: EngineMember['ageGroup']; likes: string[]; dislikes: string[]; restrictions: string[]; allergies: string[] }[]).map(
    (r) => ({
      id: r.id,
      name: r.name,
      ageGroup: r.age_group,
      likes: r.likes,
      dislikes: r.dislikes,
      restrictions: r.restrictions,
      allergies: r.allergies,
    })
  );
}
