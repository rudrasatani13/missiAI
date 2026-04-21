'use client'

import type { MemoryCategory } from '@/types/memory'

import { User, Target, Repeat, Star, Calendar, MessageSquare, Zap, MapPin, Shield, Users, Sparkles } from "lucide-react"

const CATEGORY_ICONS: Record<MemoryCategory | 'all', React.ReactNode> = {
  all: <Sparkles className="w-3.5 h-3.5" />,
  person: <User className="w-3.5 h-3.5" />,
  goal: <Target className="w-3.5 h-3.5" />,
  habit: <Repeat className="w-3.5 h-3.5" />,
  preference: <Star className="w-3.5 h-3.5" />,
  event: <Calendar className="w-3.5 h-3.5" />,
  emotion: <MessageSquare className="w-3.5 h-3.5" />,
  skill: <Zap className="w-3.5 h-3.5" />,
  place: <MapPin className="w-3.5 h-3.5" />,
  belief: <Shield className="w-3.5 h-3.5" />,
  relationship: <Users className="w-3.5 h-3.5" />,
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
          icon={CATEGORY_ICONS.all}
          label="All"
          count={counts.all}
          isSelected={selected === 'all'}
          onClick={() => onChange('all')}
        />
        {visibleCategories.map((cat) => (
          <Pill
            key={cat}
            icon={CATEGORY_ICONS[cat]}
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
  icon: React.ReactNode
  label: string
  count: number
  isSelected: boolean
  onClick: () => void
}

function Pill({ icon, label, count, isSelected, onClick }: PillProps) {
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
      <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
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
