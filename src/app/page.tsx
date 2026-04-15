'use client';

import { useState } from 'react';
import Nav from '@/components/Nav';
import { useFamily } from '@/hooks/useFamily';
import Link from 'next/link';

const AGE_ICONS: Record<string, string> = {
  baby: '👶', toddler: '🧒', child: '👦', teen: '🧑', adult: '🧑‍🦰',
};

const MEAL_ICONS: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍿',
};

export default function Dashboard() {
  const { familyCode, members, meals, loading, joinFamily } = useFamily();
  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  if (loading) {
    return (
      <>
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-12">
          <div className="animate-pulse flex flex-col gap-4">
            <div className="h-8 bg-gray-800 rounded w-1/3" />
            <div className="h-32 bg-gray-800 rounded" />
          </div>
        </main>
      </>
    );
  }

  const recentMeals = meals.slice(0, 5);
  const allergenCount = new Set(members.flatMap(m => m.allergies)).size;
  const restrictionCount = new Set(members.flatMap(m => m.restrictions)).size;

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Family Mealtime</h1>
            <p className="text-gray-400 text-sm mt-1">
              Preferences, restrictions and smart suggestions for the whole family
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
              <span className="text-gray-400">Family code: </span>
              <span className="font-mono text-emerald-400 font-bold">{familyCode}</span>
            </div>
            <button
              onClick={() => setShowJoin(!showJoin)}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Join existing
            </button>
          </div>
        </div>

        {showJoin && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter family code"
              maxLength={6}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono flex-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={() => { if (joinCode.length === 6) { joinFamily(joinCode); setShowJoin(false); } }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Join
            </button>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-white">{members.length}</div>
            <div className="text-gray-400 text-sm">Family members</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-white">{meals.length}</div>
            <div className="text-gray-400 text-sm">Meals logged</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-amber-400">{allergenCount}</div>
            <div className="text-gray-400 text-sm">Allergens tracked</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-violet-400">{restrictionCount}</div>
            <div className="text-gray-400 text-sm">Dietary needs</div>
          </div>
        </div>

        {/* Getting started or family overview */}
        {members.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl p-8 text-center">
            <div className="text-4xl mb-4">👨‍👩‍👧‍👦</div>
            <h2 className="text-xl font-semibold text-white mb-2">Add your family</h2>
            <p className="text-gray-400 mb-6">
              Start by adding family members with their food preferences, restrictions and allergies
            </p>
            <Link
              href="/members"
              className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Add first member
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Family members */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white">Family members</h2>
                <Link href="/members" className="text-emerald-400 text-sm hover:underline">Manage</Link>
              </div>
              <div className="space-y-3">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ backgroundColor: m.avatar_color }}
                    >
                      {m.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{m.name}</div>
                      <div className="text-xs text-gray-400 flex gap-2">
                        <span>{AGE_ICONS[m.age_group] || '🧑'} {m.age_group}</span>
                        {m.allergies.length > 0 && (
                          <span className="text-amber-400">⚠️ {m.allergies.length} allergen{m.allergies.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent meals */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white">Recent meals</h2>
                <Link href="/meals" className="text-emerald-400 text-sm hover:underline">View all</Link>
              </div>
              {recentMeals.length === 0 ? (
                <p className="text-gray-500 text-sm">No meals logged yet. Try the suggestions page to get started.</p>
              ) : (
                <div className="space-y-3">
                  {recentMeals.map(meal => (
                    <div key={meal.id} className="flex items-center gap-3">
                      <span className="text-lg">{MEAL_ICONS[meal.meal_type] || '🍽️'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{meal.name}</div>
                        <div className="text-xs text-gray-400">
                          {meal.meal_type} - {new Date(meal.meal_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {meal.rating && <span className="ml-2">{'⭐'.repeat(meal.rating)}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="sm:col-span-2 flex flex-wrap gap-3">
              <Link
                href="/suggest"
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-lg font-medium transition-colors"
              >
                💡 Get meal suggestions
              </Link>
              <Link
                href="/meals"
                className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-3 rounded-lg font-medium transition-colors"
              >
                📝 Log a meal
              </Link>
              <Link
                href="/members"
                className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-3 rounded-lg font-medium transition-colors"
              >
                ➕ Add family member
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

