'use client'

import type { MemoryCategory } from '@/types/memory'

const CATEGORY_ICONS: Record<MemoryCategory | 'all', string> = {
  all: '✦',
  person: '👤',
  goal: '🎯',
  habit: '🔄',
  preference: '💡',
  event: '📅',
  emotion: '💭',
  skill: '⚡',
  place: '📍',
  belief: '🌟',
  relationship: '🤝',
}

const ALL_CATEGORIES: MemoryCategory[] = [
  'belief',
  'emotion',
  'event',
  'goal',
  'habit',
  'person',
  'place',
  'preference',
  'relationship',
  'skill',
]

interface CategoryFilterProps {
  selected: MemoryCategory | 'all'
  counts: Record<MemoryCategory | 'all', number>
  onChange: (cat: MemoryCategory | 'all') => void
}

export function CategoryFilter({ selected, counts, onChange }: CategoryFilterProps) {
  const visibleCategories = ALL_CATEGORIES.filter((cat) => counts[cat] > 0)

  return (
    <div
      style={{
        overflowX: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      <style>{`.cat-filter-scroll::-webkit-scrollbar { display: none; }`}</style>
      <div
        className="cat-filter-scroll"
        style={{
          display: 'flex',
          gap: '8px',
          paddingBottom: '4px',
          whiteSpace: 'nowrap',
        }}
      >
        {/* All pill always first */}
        <Pill
          emoji={CATEGORY_ICONS.all}
          label="All"
          count={counts.all}
          isSelected={selected === 'all'}
          onClick={() => onChange('all')}
        />
        {visibleCategories.map((cat) => (
          <Pill
            key={cat}
            emoji={CATEGORY_ICONS[cat]}
            label={cat.charAt(0).toUpperCase() + cat.slice(1)}
            count={counts[cat]}
            isSelected={selected === cat}
            onClick={() => onChange(cat)}
          />
        ))}
      </div>
    </div>
  )
}

interface PillProps {
  emoji: string
  label: string
  count: number
  isSelected: boolean
  onClick: () => void
}

function Pill({ emoji, label, count, isSelected, onClick }: PillProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '999px',
        border: isSelected
          ? '1px solid rgba(255,255,255,0.3)'
          : '1px solid rgba(255,255,255,0.08)',
        background: isSelected
          ? 'rgba(255,255,255,0.15)'
          : 'rgba(255,255,255,0.04)',
        color: isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)',
        fontSize: '12px',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '18px',
          height: '18px',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.12)',
          fontSize: '10px',
          padding: '0 4px',
        }}
      >
        {count}
      </span>
    </button>
  )
}
