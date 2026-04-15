'use client';

import { useState } from 'react';
import Nav from '@/components/Nav';
import { useFamily, Member } from '@/hooks/useFamily';

const AGE_GROUPS = ['baby', 'toddler', 'child', 'teen', 'adult'];
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];
const COMMON_RESTRICTIONS = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'halal', 'kosher', 'pescatarian'];
const COMMON_ALLERGIES = ['nuts', 'peanuts', 'dairy', 'eggs', 'gluten', 'soy', 'fish', 'shellfish', 'sesame'];

interface MemberFormData {
  name: string;
  ageGroup: string;
  avatarColor: string;
  likes: string;
  dislikes: string;
  restrictions: string[];
  allergies: string[];
}

const emptyForm: MemberFormData = {
  name: '', ageGroup: 'adult', avatarColor: '#6366f1',
  likes: '', dislikes: '', restrictions: [], allergies: [],
};

function TagInput({ label, options, selected, onChange, customPlaceholder }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void; customPlaceholder: string;
}) {
  const [custom, setCustom] = useState('');

  return (
    <div>
      <label className="text-sm font-medium text-gray-300 block mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
              else onChange([...selected, opt]);
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selected.includes(opt)
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && custom.trim()) {
              e.preventDefault();
              if (!selected.includes(custom.trim().toLowerCase())) {
                onChange([...selected, custom.trim().toLowerCase()]);
              }
              setCustom('');
            }
          }}
          placeholder={customPlaceholder}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      {selected.filter(s => !options.includes(s)).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.filter(s => !options.includes(s)).map(s => (
            <span key={s} className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-2 py-0.5 rounded-full text-xs flex items-center gap-1">
              {s}
              <button type="button" onClick={() => onChange(selected.filter(x => x !== s))} className="hover:text-white">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MembersPage() {
  const { members, addMember, updateMember, deleteMember, loading } = useFamily();
  const [form, setForm] = useState<MemberFormData>(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEdit = (m: Member) => {
    setForm({
      name: m.name,
      ageGroup: m.age_group,
      avatarColor: m.avatar_color,
      likes: m.likes.join(', '),
      dislikes: m.dislikes.join(', '),
      restrictions: [...m.restrictions],
      allergies: [...m.allergies],
    });
    setEditing(m.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    const data = {
      name: form.name.trim(),
      ageGroup: form.ageGroup,
      avatarColor: form.avatarColor,
      likes: form.likes.split(',').map(s => s.trim()).filter(Boolean),
      dislikes: form.dislikes.split(',').map(s => s.trim()).filter(Boolean),
      restrictions: form.restrictions,
      allergies: form.allergies,
    };

    if (editing) {
      await updateMember({ id: editing, ...data });
    } else {
      await addMember(data);
    }

    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Remove this family member?')) {
      await deleteMember(id);
    }
  };

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Family Members</h1>
          {!showForm && (
            <button
              onClick={() => { setForm(emptyForm); setEditing(null); setShowForm(true); }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Add member
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{editing ? 'Edit member' : 'New family member'}</h2>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. Sophie"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-1">Age group</label>
                <select
                  value={form.ageGroup}
                  onChange={e => setForm({ ...form, ageGroup: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {AGE_GROUPS.map(g => (
                    <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-300 block mb-2">Colour</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, avatarColor: c })}
                    className={`w-8 h-8 rounded-full transition-all ${form.avatarColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-1">Likes (comma-separated)</label>
                <input
                  type="text"
                  value={form.likes}
                  onChange={e => setForm({ ...form, likes: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. chicken, pasta, rice"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-1">Dislikes (comma-separated)</label>
                <input
                  type="text"
                  value={form.dislikes}
                  onChange={e => setForm({ ...form, dislikes: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. mushrooms, olives"
                />
              </div>
            </div>

            <TagInput
              label="Dietary restrictions"
              options={COMMON_RESTRICTIONS}
              selected={form.restrictions}
              onChange={r => setForm({ ...form, restrictions: r })}
              customPlaceholder="Add custom restriction (Enter)"
            />

            <TagInput
              label="Allergies"
              options={COMMON_ALLERGIES}
              selected={form.allergies}
              onChange={a => setForm({ ...form, allergies: a })}
              customPlaceholder="Add custom allergen (Enter)"
            />

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white py-2.5 rounded-lg font-medium transition-colors"
            >
              {saving ? 'Saving...' : editing ? 'Update member' : 'Add member'}
            </button>
          </form>
        )}

        {/* Members list */}
        {loading ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-800 rounded-xl" />)}
          </div>
        ) : members.length === 0 && !showForm ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">👨‍👩‍👧‍👦</div>
            <p>No family members yet. Add your first one above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map(m => (
              <div key={m.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0 mt-0.5"
                    style={{ backgroundColor: m.avatar_color }}
                  >
                    {m.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-white">{m.name}</span>
                        <span className="text-gray-500 text-sm ml-2">{m.age_group}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(m)} className="text-gray-400 hover:text-emerald-400 text-sm transition-colors">Edit</button>
                        <button onClick={() => handleDelete(m.id)} className="text-gray-400 hover:text-red-400 text-sm transition-colors">Remove</button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.allergies.map(a => (
                        <span key={a} className="bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full text-xs">
                          ⚠️ {a}
                        </span>
                      ))}
                      {m.restrictions.map(r => (
                        <span key={r} className="bg-violet-500/15 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full text-xs">
                          {r}
                        </span>
                      ))}
                      {m.likes.map(l => (
                        <span key={l} className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-xs">
                          👍 {l}
                        </span>
                      ))}
                      {m.dislikes.map(d => (
                        <span key={d} className="bg-gray-700/50 text-gray-400 border border-gray-600/30 px-2 py-0.5 rounded-full text-xs">
                          👎 {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

