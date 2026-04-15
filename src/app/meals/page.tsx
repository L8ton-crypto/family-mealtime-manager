'use client';

import { useState } from 'react';
import Nav from '@/components/Nav';
import { useFamily } from '@/hooks/useFamily';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_ICONS: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍿',
};

export default function MealsPage() {
  const { meals, addMeal, deleteMeal, loading } = useFamily();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState('dinner');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await addMeal({
      name: name.trim(),
      meal_type: mealType,
      meal_date: date,
      rating: rating || null,
      notes: notes.trim() || null,
    });
    setName('');
    setRating(0);
    setNotes('');
    setShowForm(false);
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Remove this meal entry?')) {
      await deleteMeal(id);
    }
  };

  // Group meals by date
  const grouped = meals.reduce((acc, meal) => {
    const d = meal.meal_date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(meal);
    return acc;
  }, {} as Record<string, typeof meals>);

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Meal Log</h1>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Log meal
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Log a meal</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-300 block mb-1">What did you eat?</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. Spaghetti Bolognese"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-1">Meal type</label>
                <select
                  value={mealType}
                  onChange={e => setMealType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {MEAL_TYPES.map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-300 block mb-1">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? 0 : n)}
                    className={`text-2xl transition-transform hover:scale-110 ${n <= rating ? '' : 'opacity-30'}`}
                  >
                    ⭐
                  </button>
                ))}
                {rating > 0 && (
                  <button type="button" onClick={() => setRating(0)} className="text-gray-500 text-sm ml-2 hover:text-gray-300">
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-300 block mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                placeholder="e.g. Kids loved it, made extra sauce"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white py-2.5 rounded-lg font-medium transition-colors"
            >
              {saving ? 'Saving...' : 'Log meal'}
            </button>
          </form>
        )}

        {/* Meals list */}
        {loading ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-800 rounded-xl" />)}
          </div>
        ) : meals.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">📝</div>
            <p>No meals logged yet. Start tracking what your family eats.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([dateStr, dateMeals]) => (
              <div key={dateStr}>
                <h3 className="text-sm font-medium text-gray-400 mb-2">
                  {new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <div className="space-y-2">
                  {dateMeals.map(meal => (
                    <div key={meal.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
                      <span className="text-xl">{MEAL_ICONS[meal.meal_type] || '🍽️'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{meal.name}</div>
                        <div className="text-xs text-gray-400">
                          {meal.meal_type}
                          {meal.rating && <span className="ml-2">{'⭐'.repeat(meal.rating)}</span>}
                          {meal.notes && <span className="ml-2 text-gray-500">- {meal.notes}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(meal.id)}
                        className="text-gray-500 hover:text-red-400 text-sm transition-colors shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

