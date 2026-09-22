'use client';

import { useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { ChipToggle } from '@/components/ui/ChipToggle';

type ChipVariant = 'plain' | 'soft' | 'outline' | 'allergen' | 'dislike';

interface TagEditorProps {
  label: string;
  presets: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  chipVariant: ChipVariant;
}

/** Preset chips (click to toggle) plus a custom free-text entry. */
export function TagEditor({ label, presets, value, onChange, chipVariant }: TagEditorProps) {
  const [customInput, setCustomInput] = useState('');

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
  }

  function addCustom() {
    const tag = customInput.trim().toLowerCase();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setCustomInput('');
  }

  const customTags = value.filter((tag) => !presets.includes(tag));

  return (
    <div>
      <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-chalk-soft">{label}</span>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <ChipToggle
            key={preset}
            label={preset}
            pressed={value.includes(preset)}
            onToggle={() => toggle(preset)}
            variant={chipVariant}
          />
        ))}
        {customTags.map((tag) => (
          <Chip key={tag} variant={chipVariant} onRemove={() => toggle(tag)}>
            {tag}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={customInput}
          onChange={(event) => setCustomInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add custom…"
          className="min-h-[36px] flex-1 rounded-sm border border-steel bg-paper px-2 py-1 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-pass"
        />
        <button
          type="button"
          onClick={addCustom}
          className="min-h-[36px] rounded-sm border border-ink px-3 font-mono text-xs uppercase tracking-wide text-ink hover:bg-paper-2"
        >
          Add
        </button>
      </div>
    </div>
  );
}
