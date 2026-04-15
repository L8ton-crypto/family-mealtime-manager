'use client';

import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import { useFamily } from '@/hooks/useFamily';

interface Suggestion {
  name: string;
  description: string;
  score: number;
  warnings: string[];
}

const MEAL_TYPES = ['all', 'breakfast', 'lunch', 'dinner', 'snack'];

export default function SuggestPage() {
  const { familyCode, members, addMeal, loading } = useFamily();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mealType, setMealType] = useState('all');
  const [fetching, setFetching] = useState(false);
  const [logged, setLogged] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!familyCode) return;
    setFetching(true);
    const params = new URLSearchParams({ familyCode });
    if (mealType !== 'all') params.set('mealType', mealType);

    fetch(`/api/suggest?${params}`)
      .then(r => r.json())
      .then(data => setSuggestions(data))
      .catch(console.error)
      .finally(() => setFetching(false));
  }, [familyCode, mealType]);

  const logMeal = async (name: string) => {
    const ok = await addMeal({
      name,
      meal_type: mealType === 'all' ? 'dinner' : mealType,
    });
    if (ok) setLogged(prev => new Set([...prev, name]));
  };

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Meal Suggestions</h1>
          <p className="text-gray-400 text-sm">
            {members.length > 0
              ? `Smart picks based on ${members.length} family member${members.length !== 1 ? 's' : ''} preferences`
              : 'Add family members first to get personalised suggestions'}
          </p>
        </div>

        {/* Meal type filter */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {MEAL_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setMealType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                mealType === t
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Constraint summary */}
        {members.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Active constraints</h3>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(members.flatMap(m => m.allergies))].map(a => (
                <span key={a} className="bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full text-xs">
                  No {a}
                </span>
              ))}
              {[...new Set(members.flatMap(m => m.restrictions))].map(r => (
                <span key={r} className="bg-violet-500/15 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full text-xs">
                  {r}
                </span>
              ))}
              {members.flatMap(m => m.allergies).length === 0 && members.flatMap(m => m.restrictions).length === 0 && (
                <span className="text-gray-500 text-xs">No restrictions or allergies set</span>
              )}
            </div>
          </div>
        )}

        {/* Loading */}
        {(loading || fetching) && (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-800 rounded-xl" />)}
          </div>
        )}

        {/* Suggestions */}
        {!loading && !fetching && suggestions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">🤔</div>
            <p>{members.length === 0 ? 'Add family members to get suggestions' : 'No meals match your family\'s constraints. Try a different meal type.'}</p>
          </div>
        )}

        {!loading && !fetching && suggestions.length > 0 && (
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <div key={s.name} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {i === 0 && <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-medium">Top pick</span>}
                      <h3 className="font-medium text-white">{s.name}</h3>
                    </div>
                    <p className="text-gray-400 text-sm mt-1">{s.description}</p>
                    {s.warnings.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.warnings.map((w, j) => (
                          <span key={j} className="text-amber-400 text-xs">⚠️ {w}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => logMeal(s.name)}
                    disabled={logged.has(s.name)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      logged.has(s.name)
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-gray-800 hover:bg-emerald-600 text-gray-300 hover:text-white'
                    }`}
                  >
                    {logged.has(s.name) ? '✓ Logged' : '+ Log'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

