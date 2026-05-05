'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion'
import {
  Wallet, Plus, PieChart, List, Target, Sparkles, Settings,
  Loader2, TrendingUp, TrendingDown, Trash2, Download,
  X, ChevronLeft, ChevronRight, ChevronDown, CalendarDays,
  UtensilsCrossed, Car, ShoppingCart, Film, HeartPulse,
  ShoppingBag, Lightbulb, GraduationCap, Plane, House,
  Tv, Gift, Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  BudgetSettings, ExpenseEntry, ExpenseCategory,
  MonthlyReport, SpendingInsight, BudgetTab,
} from '@/types/budget'
import { VALID_EXPENSE_CATEGORIES } from '@/types/budget'
import {
  currencySymbol, formatMoney, DEFAULT_CURRENCY,
} from '@/lib/budget/currency'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  settings: BudgetSettings | null
  currentMonth: MonthlyReport | null
  previousMonth: MonthlyReport | null
  insight: SpendingInsight | null
  recentEntries: ExpenseEntry[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getPreviousYearMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftYearMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const monthLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
})

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const CALENDAR_DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function formatYearMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return monthLabelFormatter.format(new Date(y, m - 1, 1))
}

function parseDateValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return new Date()
  return new Date(y, m - 1, d)
}

function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatEntryDate(value: string): string {
  return shortDateFormatter.format(parseDateValue(value))
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getCalendarDays(month: Date): Date[] {
  const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  const firstDayIndex = firstDayOfMonth.getDay()
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - firstDayIndex)

  return Array.from({ length: 42 }, (_, index) => {
    return new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
  })
}

function formatCategoryLabel(category: ExpenseCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

const TABS: { key: BudgetTab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <PieChart className="w-4 h-4" /> },
  { key: 'entries', label: 'Entries', icon: <List className="w-4 h-4" /> },
  { key: 'budgets', label: 'Budgets', icon: <Target className="w-4 h-4" /> },
  { key: 'insights', label: 'Insights', icon: <Sparkles className="w-4 h-4" /> },
  { key: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
]

const CATEGORY_COLORS: Record<string, string> = {
  food: '#22C55E', transport: '#3B82F6', groceries: '#10B981',
  entertainment: '#A855F7', health: '#EF4444', shopping: '#F59E0B',
  utilities: '#6366F1', education: '#8B5CF6', travel: '#0EA5E9',
  housing: '#B45309', subscriptions: '#EC4899', gifts: '#F97316',
  other: '#9CA3AF',
}

// ─── Animation Variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 260, damping: 20 },
  },
}

const GlassCard = GlowCard

// ─── Design System Components ─────────────────────────────────────────────────

function GlowCard({
  children, className = '', delay = 0, glowColor = 'rgba(99,102,241,0.15)',
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  glowColor?: string
}) {
  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="show"
      transition={{ delay }}
      whileHover={{ y: -1, transition: { duration: 0.2 } }}
      className={`relative overflow-hidden rounded-[30px] ${className}`}
      style={{
        background: 'var(--missi-surface)',
        backdropFilter: 'blur(28px) saturate(125%)',
        WebkitBackdropFilter: 'blur(28px) saturate(125%)',
        border: '1px solid var(--missi-border)',
        boxShadow: `0 30px 80px -45px rgba(0,0,0,0.78), inset 0 1px 0 var(--missi-border), 0 0 0 0 ${glowColor}`,
      }}
    >
      <div className="relative z-10">{children}</div>
    </motion.div>
  )
}

function CountUp({ target, prefix = '', suffix = '', duration = 1.5 }: { target: number; prefix?: string; suffix?: string; duration?: number }) {
  const spring = useSpring(0, { duration: duration * 1000, bounce: 0 })
  const display = useTransform(spring, (v) => {
    if (v >= 1000) return `${prefix}${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}${suffix}`
    return `${prefix}${v.toFixed(v < 10 ? 2 : 0)}${suffix}`
  })
  useEffect(() => { spring.set(target) }, [spring, target])
  return <motion.span>{display}</motion.span>
}

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] ${className}`}
      style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
    >
      <motion.div
        className="absolute inset-y-0 -left-1/3 w-1/3"
        style={{ background: 'linear-gradient(90deg, transparent, var(--missi-border), transparent)' }}
        animate={{ x: ['0%', '320%'] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

function MonthStepper({ month, onChange }: { month: string; onChange: (value: string) => void }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full p-2"
      style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
    >
      <button
        type="button"
        onClick={() => onChange(shiftYearMonth(month, -1))}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        style={{ background: 'var(--missi-surface)', color: 'var(--missi-text-secondary)' }}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="min-w-[148px] px-1 text-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={month}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="text-sm font-medium tracking-[-0.02em]"
            style={{ color: 'var(--missi-text-primary)' }}
          >
            {formatYearMonth(month)}
          </motion.div>
        </AnimatePresence>
      </div>
      <button
        type="button"
        onClick={() => onChange(shiftYearMonth(month, 1))}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        style={{ background: 'var(--missi-surface)', color: 'var(--missi-text-secondary)' }}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function DashboardLoadingState() {
  return (
    <div className="relative min-h-screen" style={{ color: 'var(--missi-text-primary)' }}>
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-16 pt-4 md:px-8 md:pt-8">
        <div
          className="rounded-[36px] p-6 md:p-8"
          style={{
            background: 'var(--missi-surface)',
            border: '1px solid var(--missi-border)',
            boxShadow: '0 30px 80px -45px rgba(0,0,0,0.75)',
          }}
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-12 w-52 md:w-72" />
              <Skeleton className="h-4 w-56 md:w-80" />
            </div>
            <Skeleton className="h-12 w-full rounded-full md:w-[220px]" />
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-[minmax(0,1.45fr)_repeat(3,minmax(0,1fr))]">
            <Skeleton className="h-36 md:h-40" />
            <Skeleton className="h-28 md:h-40" />
            <Skeleton className="h-28 md:h-40" />
            <Skeleton className="h-28 md:h-40" />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 px-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-16 rounded-full" />
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.92fr)]">
          <Skeleton className="h-[320px]" />
          <Skeleton className="h-[320px]" />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-[250px]" />
          <Skeleton className="h-[250px]" />
        </div>
      </div>
    </div>
  )
}

// ─── Chart Components ─────────────────────────────────────────────────────────

function DonutChart({ data, size = 160, strokeWidth = 18 }: {
  data: { label: string; value: number; color: string }[]
  size?: number
  strokeWidth?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {data.map((d, i) => {
          const pct = total > 0 ? d.value / total : 0
          const dash = pct * circumference
          const segment = (
            <motion.circle
              key={d.label}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={d.color} strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray: `${dash} ${circumference - dash}` }}
              transition={{ duration: 1, delay: i * 0.15, ease: 'easeOut' }}
            />
          )
          offset += dash
          return segment
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        <span className="text-xs font-medium" style={{ color: 'var(--missi-text-muted)' }}>Total</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--missi-text-secondary)' }}>{total > 0 ? total.toLocaleString() : '0'}</span>
      </div>
    </div>
  )
}

function AreaChartSvg({ data, width = 300, height = 100 }: {
  data: { day: number; amount: number }[]
  width?: number
  height?: number
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-full" style={{ minHeight: height }}>
        <span className="text-xs" style={{ color: 'var(--missi-text-muted)' }}>Not enough data</span>
      </div>
    )
  }
  const maxVal = Math.max(...data.map((d) => d.amount), 1)
  const padding = 4
  const chartW = width - padding * 2
  const chartH = height - padding * 2
  const stepX = chartW / (data.length - 1)
  const points = data.map((d, i) => ({
    x: padding + i * stepX,
    y: padding + chartH - (d.amount / maxVal) * chartH,
  }))
  const areaPath = `M ${points[0].x} ${height} ${points.map((p) => `L ${p.x} ${p.y}`).join(' ')} L ${points[points.length - 1].x} ${height} Z`
  const linePath = `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')}`
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="overflow-visible">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={areaPath} fill="url(#areaGrad)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} />
      <motion.path d={linePath} fill="none" stroke="#6366F1" strokeWidth={2} strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeInOut' }} />
      {points.map((p, i) => (
        <motion.circle key={i} cx={p.x} cy={p.y} r={3} fill="#818CF8"
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.8 + i * 0.05 }} />
      ))}
    </svg>
  )
}

function BudgetRing({ pct, color, size = 48, strokeWidth = 4 }: {
  pct: number; color: string; size?: number; strokeWidth?: number
}) {
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const dash = (Math.min(pct, 100) / 100) * c
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--missi-border)" strokeWidth={strokeWidth} />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        initial={{ strokeDasharray: `0 ${c}` }} animate={{ strokeDasharray: `${dash} ${c}` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
    </svg>
  )
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

function BottomSheet({ isOpen, onClose, children }: {
  isOpen: boolean; onClose: () => void; children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120]"
            style={{ background: 'var(--missi-surface)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[130] flex items-end justify-center p-0 md:items-center md:p-6">
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="w-full overflow-hidden rounded-t-[32px] md:max-w-2xl md:rounded-[32px] md:overflow-visible"
              style={{
                background: 'linear-gradient(180deg, rgba(14,15,20,0.98) 0%, rgba(10,10,14,0.98) 100%)',
                borderTop: '1px solid var(--missi-border)',
                border: '1px solid var(--missi-border)',
                boxShadow: '0 24px 90px rgba(0,0,0,0.52)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 mt-4 h-1.5 w-14 rounded-full md:hidden" style={{ background: 'var(--missi-border-strong)' }} />
              <div className="max-h-[88vh] overflow-y-auto px-5 pb-10 pt-2 md:max-h-none md:overflow-visible md:px-8 md:pb-8 md:pt-6">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

function QuickStatCard({
  label,
  value,
  prefix,
  suffix,
  icon,
  delay = 0,
  trend,
}: {
  label: string
  value: number | string
  prefix?: string
  suffix?: string
  icon: React.ReactNode
  delay?: number
  trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="show"
      transition={{ delay }}
      className="rounded-[24px] p-4 md:p-5"
      style={{
        background: 'var(--missi-surface)',
        border: '1px solid var(--missi-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--missi-text-muted)' }}>{icon}</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: 'var(--missi-text-muted)' }}>
          {label}
        </span>
      </div>
      <div className="mt-6 text-xl font-medium tracking-[-0.04em] md:text-2xl" style={{ color: 'var(--missi-text-primary)' }}>
        {typeof value === 'number' ? <CountUp target={value} prefix={prefix} suffix={suffix} /> : value}
      </div>
      {trend && trend !== 'neutral' && (
        <div className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--missi-text-muted)' }}>
          {trend === 'up' ? <TrendingUp className="w-3 h-3 text-red-400" /> : <TrendingDown className="w-3 h-3 text-green-400" />}
          <span>
            {trend === 'up' ? 'Above last month' : 'Below last month'}
          </span>
        </div>
      )}
    </motion.div>
  )
}

function CategoryGlyph({ category, className = '' }: { category: ExpenseCategory; className?: string }) {
  switch (category) {
    case 'food':
      return <UtensilsCrossed className={className} />
    case 'transport':
      return <Car className={className} />
    case 'groceries':
      return <ShoppingCart className={className} />
    case 'entertainment':
      return <Film className={className} />
    case 'health':
      return <HeartPulse className={className} />
    case 'shopping':
      return <ShoppingBag className={className} />
    case 'utilities':
      return <Lightbulb className={className} />
    case 'education':
      return <GraduationCap className={className} />
    case 'travel':
      return <Plane className={className} />
    case 'housing':
      return <House className={className} />
    case 'subscriptions':
      return <Tv className={className} />
    case 'gifts':
      return <Gift className={className} />
    default:
      return <Receipt className={className} />
  }
}

function CategoryPickerField({
  value,
  onChange,
}: {
  value: ExpenseCategory
  onChange: (value: ExpenseCategory) => void
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={panelRef} className="relative">
      <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
        Category
      </label>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative w-full rounded-[20px] px-4 py-3 text-left text-sm"
        style={{
          background: 'var(--missi-surface)',
          border: '1px solid var(--missi-border)',
        }}
      >
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center" style={{ color: 'var(--missi-text-secondary)' }}>
          <CategoryGlyph category={value} className="h-4 w-4" />
        </span>
        <span className="block truncate pl-7 pr-14" style={{ color: 'var(--missi-text-primary)' }}>
          {formatCategoryLabel(value)}
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-6 flex items-center">
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            style={{ color: 'var(--missi-text-muted)' }}
          />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 top-[calc(100%+12px)] z-30 w-full overflow-hidden rounded-[24px]"
            style={{
              background: 'linear-gradient(180deg, rgba(14,15,20,0.98) 0%, rgba(10,10,14,0.98) 100%)',
              border: '1px solid var(--missi-border)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            }}
          >
            <div className="max-h-72 space-y-1 overflow-y-auto p-2">
              {VALID_EXPENSE_CATEGORIES.map((cat) => {
                const typedCat = cat as ExpenseCategory
                const isActive = typedCat === value

                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      onChange(typedCat)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors"
                    style={{
                      background: isActive ? 'var(--missi-border)' : 'transparent',
                      color: isActive ? 'var(--missi-text-primary)' : 'var(--missi-text-secondary)',
                    }}
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full"
                      style={{ background: isActive ? 'var(--missi-border)' : 'var(--missi-surface)' }}
                    >
                      <CategoryGlyph category={typedCat} className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium">{formatCategoryLabel(typedCat)}</span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DatePickerField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selectedDate = useMemo(() => parseDateValue(value), [value])
  const [open, setOpen] = useState(false)
  const [displayMonth, setDisplayMonth] = useState(() => {
    return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  })
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setDisplayMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [selectedDate])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const calendarDays = useMemo(() => getCalendarDays(displayMonth), [displayMonth])
  const today = new Date()

  return (
    <div ref={panelRef} className="relative">
      <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
        Date
      </label>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative w-full rounded-[20px] px-4 py-3 text-left text-sm"
        style={{
          background: 'var(--missi-surface)',
          border: '1px solid var(--missi-border)',
        }}
      >
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center" style={{ color: 'var(--missi-text-secondary)' }}>
          <CalendarDays className="h-4 w-4" />
        </span>
        <span className="block truncate pl-7 pr-14" style={{ color: 'var(--missi-text-primary)' }}>
          {formatEntryDate(value)}
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-6 flex items-center">
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            style={{ color: 'var(--missi-text-muted)' }}
          />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 top-[calc(100%+12px)] z-30 min-w-[292px] overflow-hidden rounded-[24px] p-4"
            style={{
              background: 'linear-gradient(180deg, rgba(14,15,20,0.98) 0%, rgba(10,10,14,0.98) 100%)',
              border: '1px solid var(--missi-border)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: 'var(--missi-text-primary)' }}>
                {monthLabelFormatter.format(displayMonth)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: 'var(--missi-surface)', color: 'var(--missi-text-secondary)' }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: 'var(--missi-surface)', color: 'var(--missi-text-secondary)' }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {CALENDAR_DAY_LABELS.map((label) => (
                <div key={label} className="pb-1 text-center text-[11px] font-medium" style={{ color: 'var(--missi-text-muted)' }}>
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const isSelected = isSameCalendarDay(day, selectedDate)
                const isToday = isSameCalendarDay(day, today)
                const isOutsideMonth = day.getMonth() !== displayMonth.getMonth()

                return (
                  <button
                    key={toDateValue(day)}
                    type="button"
                    onClick={() => {
                      onChange(toDateValue(day))
                      setOpen(false)
                    }}
                    className="flex h-9 items-center justify-center rounded-full text-sm transition-colors"
                    style={{
                      background: isSelected ? 'var(--missi-nav-text-active)' : isToday ? 'var(--missi-surface)' : 'transparent',
                      color: isSelected ? 'var(--missi-bg)' : isOutsideMonth ? 'var(--missi-text-muted)' : 'var(--missi-text-secondary)',
                      border: isToday && !isSelected ? '1px solid var(--missi-border-strong)' : '1px solid transparent',
                    }}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--missi-border)' }}>
              <span className="text-xs" style={{ color: 'var(--missi-text-muted)' }}>
                {formatEntryDate(value)}
              </span>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  onChange(toDateValue(now))
                  setDisplayMonth(new Date(now.getFullYear(), now.getMonth(), 1))
                  setOpen(false)
                }}
                className="text-xs font-medium"
                style={{ color: 'var(--missi-text-secondary)' }}
              >
                Use today
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AddExpenseForm({
  currency,
  onSuccess,
  onCancel,
}: {
  currency: string
  onSuccess: () => void
  onCancel?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [amount, setAmount] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory>('food')
  const [selectedCurrency, setSelectedCurrency] = useState(currency)
  const [description, setDescription] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    setSelectedCurrency(currency)
  }, [currency])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/v1/budget/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          currency: selectedCurrency,
          category: selectedCategory,
          description,
          date: entryDate,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Expense logged')
        onSuccess()
      } else if (res.status === 429) {
        toast.error('Daily limit reached (200 entries)')
      } else {
        toast.error(json.error || 'Failed to log expense')
      }
    } catch {
      toast.error('Failed to log expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
            Quick capture
          </span>
          <h3 className="m-0 text-2xl font-medium tracking-[-0.04em]" style={{ color: 'var(--missi-text-primary)' }}>
            Add Expense
          </h3>
          <p className="m-0 max-w-md text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
            Quick capture for your monthly flow.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
          >
            <X className="w-4 h-4" style={{ color: 'var(--missi-text-secondary)' }} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
            Amount
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            className="w-full rounded-[20px] px-4 py-3 text-sm"
            style={{
              background: 'var(--missi-surface)',
              border: '1px solid var(--missi-border)',
              color: 'var(--missi-text-primary)',
              outline: 'none',
            }}
          />
        </div>
        <div>
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
            Currency
          </label>
          <div className="relative">
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="w-full appearance-none rounded-[20px] px-4 py-3 pr-16 text-sm"
              style={{
                background: 'var(--missi-surface)',
                border: '1px solid var(--missi-border)',
                color: 'var(--missi-text-primary)',
                outline: 'none',
              }}
            >
              {['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'SGD', 'CHF', 'CNY'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-6 flex items-center">
              <ChevronDown className="h-4 w-4" style={{ color: 'var(--missi-text-muted)' }} />
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CategoryPickerField value={selectedCategory} onChange={setSelectedCategory} />
        <DatePickerField value={entryDate} onChange={setEntryDate} />
      </div>

      <div>
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 200))}
          placeholder="What did you spend on?"
          className="w-full rounded-[20px] px-4 py-3 text-sm"
          style={{
            background: 'var(--missi-surface)',
            border: '1px solid var(--missi-border)',
            color: 'var(--missi-text-primary)',
            outline: 'none',
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-4 border-t pt-4" style={{ borderColor: 'var(--missi-border)' }}>
        <p className="m-0 text-xs leading-5" style={{ color: 'var(--missi-text-muted)' }}>
          Your expense will be added to the selected month immediately.
        </p>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-w-[160px] items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition-colors"
          style={{
            background: saving ? 'var(--missi-surface)' : 'var(--missi-nav-text-active)',
            border: '1px solid var(--missi-border)',
            color: saving ? 'var(--missi-text-muted)' : 'var(--missi-bg)',
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Expense'}
        </button>
      </div>
    </form>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BudgetBuddyDashboard() {
  const [activeTab, setActiveTab] = useState<BudgetTab>('overview')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(getCurrentYearMonth())
  const [sheetOpen, setSheetOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, reportRes, prevReportRes, insightRes, entriesRes] = await Promise.all([
        fetch('/api/v1/budget/settings'),
        fetch(`/api/v1/budget/report?month=${month}`),
        fetch(`/api/v1/budget/report?month=${getPreviousYearMonth(month)}`),
        fetch(`/api/v1/budget/insight?month=${month}`),
        fetch(`/api/v1/budget/entries?month=${month}`),
      ])
      const [settingsJson, reportJson, prevJson, insightJson, entriesJson] = await Promise.all([
        settingsRes.json(),
        reportRes.json(),
        prevReportRes.json(),
        insightRes.json(),
        entriesRes.json(),
      ])
      setData({
        settings: settingsJson.success ? settingsJson.settings : null,
        currentMonth: reportJson.success ? reportJson.report : null,
        previousMonth: prevJson.success ? prevJson.report : null,
        insight: insightJson.success ? insightJson.insight : null,
        recentEntries: entriesJson.success ? entriesJson.entries : [],
      })
    } catch {
      toast.error('Failed to load budget data')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const currency = data?.settings?.preferredCurrency ?? DEFAULT_CURRENCY
  const report = data?.currentMonth
  const prevReport = data?.previousMonth
  const total = report?.total ?? 0
  const prevTotal = prevReport?.total ?? 0
  const entryCount = report?.entryCount ?? 0
  const topCat = report?.topCategories[0]
  const monthLabel = formatYearMonth(month)
  const activeBudgetCount = data?.settings?.limits?.length ?? 0
  const comparisonText = prevTotal > 0
    ? `${Math.abs(((total - prevTotal) / prevTotal) * 100).toFixed(1)}% ${total >= prevTotal ? 'above' : 'below'} last month`
    : 'No comparison yet'
  const monthNarrative = entryCount > 0
    ? `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} tracked${topCat ? `, led by ${topCat.category}.` : '.'}`
    : `Start logging to build ${monthLabel}'s monthly story.`

  // Area chart data from entries grouped by day
  const areaData = useMemo(() => {
    if (!data?.recentEntries?.length) return []
    const byDay: Record<number, number> = {}
    data.recentEntries.forEach((e) => {
      const day = parseInt(e.date.slice(-2), 10)
      byDay[day] = (byDay[day] || 0) + e.amount
    })
    return Object.entries(byDay).map(([day, amount]) => ({ day: Number(day), amount })).sort((a, b) => a.day - b.day)
  }, [data?.recentEntries])

  if (loading) {
    return <DashboardLoadingState />
  }

  return (
    <div className="relative min-h-screen" style={{ color: 'var(--missi-text-primary)' }}>
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-20 pt-4 md:px-8 md:pt-8">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="rounded-[36px] p-6 md:p-8"
          style={{
            background: 'var(--missi-surface)',
            border: '1px solid var(--missi-border)',
            boxShadow: '0 30px 80px -45px rgba(0,0,0,0.75)',
          }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <div
                className="inline-flex items-center gap-3 rounded-full px-3 py-2"
                style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'var(--missi-surface)' }}>
                  <Wallet className="h-4 w-4" style={{ color: 'var(--missi-text-secondary)' }} />
                </div>
                <span className="text-[11px] font-medium uppercase tracking-[0.28em]" style={{ color: 'var(--missi-text-secondary)' }}>
                  Budget Buddy
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="m-0 text-4xl font-medium tracking-[-0.06em] md:text-6xl" style={{ color: 'var(--missi-text-primary)' }}>
                  {monthLabel}
                </h1>
                <p className="max-w-xl text-sm leading-7 md:text-base" style={{ color: 'var(--missi-text-secondary)' }}>
                  {monthNarrative}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-3 md:items-end">
              <MonthStepper month={month} onChange={setMonth} />
              <button
                onClick={() => setSheetOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-transform"
                style={{ background: 'var(--missi-nav-text-active)', color: 'var(--missi-bg)' }}
              >
                <Plus className="h-4 w-4" />
                Add expense
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-[minmax(0,1.45fr)_repeat(3,minmax(0,1fr))]">
            <GlassCard className="p-5 md:p-6">
              <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
                This month
              </span>
              <div className="mt-4 text-4xl font-medium tracking-[-0.05em] md:text-[3.5rem]" style={{ color: 'var(--missi-text-primary)' }}>
                {formatMoney(total, currency)}
              </div>
              <p className="mt-3 text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
                {comparisonText}
              </p>
            </GlassCard>

            <QuickStatCard
              label="Entries"
              value={entryCount}
              icon={<List className="h-4 w-4" />}
              delay={0.04}
            />
            <QuickStatCard
              label="Top Category"
              value={topCat ? formatCategoryLabel(topCat.category) : 'No leader yet'}
              icon={topCat ? <CategoryGlyph category={topCat.category} className="h-4 w-4" /> : <PieChart className="h-4 w-4" />}
              delay={0.08}
            />
            <QuickStatCard
              label="Budgets"
              value={activeBudgetCount > 0 ? `${activeBudgetCount} active` : 'No limits'}
              icon={<Target className="h-4 w-4" />}
              delay={0.12}
            />
          </div>
        </motion.section>

        {/* Floating Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="border-b px-1"
          style={{ borderColor: 'var(--missi-border)' }}
        >
          <div className="flex flex-wrap items-center gap-6">
            {TABS.map((t) => {
              const isActive = activeTab === t.key
              return (
                <motion.button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className="relative flex items-center gap-2 pb-4 text-sm font-medium transition-colors"
                  style={{
                    color: isActive ? 'var(--missi-text-primary)' : 'var(--missi-text-muted)',
                    cursor: 'pointer',
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span style={{ opacity: isActive ? 1 : 0.72 }}>{t.icon}</span>
                  <span>{t.label}</span>
                  {isActive && (
                    <motion.span
                      layoutId="budget-tab-underline"
                      className="absolute inset-x-0 -bottom-px h-px"
                      style={{ background: 'var(--missi-nav-text-active)' }}
                    />
                  )}
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        {/* Tab Content */}
        <div className="relative">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <OverviewTab key="overview" data={data} currency={currency} month={month} areaData={areaData} />
          )}
          {activeTab === 'entries' && (
            <EntriesTab key="entries" data={data} currency={currency} month={month} onRefresh={fetchData} />
          )}
          {activeTab === 'budgets' && (
            <BudgetsTab key="budgets" data={data} currency={currency} month={month} onRefresh={fetchData} />
          )}
          {activeTab === 'insights' && (
            <InsightsTab key="insights" data={data} currency={currency} month={month} onRefresh={fetchData} />
          )}
          {activeTab === 'settings' && (
            <SettingsTab key="settings" data={data} onRefresh={fetchData} />
          )}
        </AnimatePresence>
        </div>

        <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)}>
          <AddExpenseForm
            currency={currency}
            onSuccess={() => {
              setSheetOpen(false)
              fetchData()
            }}
            onCancel={() => setSheetOpen(false)}
          />
        </BottomSheet>
      </div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  data,
  currency,
  month,
  areaData,
}: {
  data: DashboardData | null
  currency: string
  month: string
  areaData: { day: number; amount: number }[]
}) {
  const report = data?.currentMonth
  const donutData = (report?.topCategories ?? []).slice(0, 5).map((cat) => ({
    label: cat.category,
    value: cat.amount,
    color: CATEGORY_COLORS[cat.category] || '#9CA3AF',
  }))
  const activeBudgets = (data?.settings?.limits ?? []).slice(0, 4)
  const monthLabel = formatYearMonth(month)

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.92fr)]">
        <GlassCard delay={0.04} className="p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
                Daily rhythm
              </span>
              <h2 className="m-0 text-2xl font-medium tracking-[-0.05em] md:text-3xl" style={{ color: 'var(--missi-text-primary)' }}>
                Spending flow
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
              {areaData.length > 1 ? `${areaData.length} checkpoints mapped across ${monthLabel}.` : 'Log a few more expenses and this view will start feeling alive.'}
            </p>
          </div>
          <div
            className="mt-8 rounded-[28px] p-4 md:p-6"
            style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
          >
            <AreaChartSvg data={areaData} width={820} height={220} />
          </div>
        </GlassCard>

        <GlassCard delay={0.08} className="p-6 md:p-8">
          <div className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
              Category focus
            </span>
            <h2 className="m-0 text-2xl font-medium tracking-[-0.05em]" style={{ color: 'var(--missi-text-primary)' }}>
              Spend mix
            </h2>
          </div>
          <div className="mt-8 flex justify-center">
            <DonutChart data={donutData} size={176} strokeWidth={18} />
          </div>
          <div className="mt-8 space-y-3">
            {report && report.topCategories.length > 0 ? (
              report.topCategories.slice(0, 3).map((cat) => (
                <div key={cat.category} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2" style={{ color: 'var(--missi-text-secondary)' }}>
                    <CategoryGlyph category={cat.category} className="h-4 w-4" />
                    <span className="capitalize">{cat.category}</span>
                  </span>
                  <span style={{ color: 'var(--missi-text-secondary)' }}>{formatMoney(cat.amount, currency)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
                No category signals yet for this month.
              </p>
            )}
          </div>
        </GlassCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard delay={0.12} className="p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
                Budget pulse
              </span>
              <h2 className="m-0 text-2xl font-medium tracking-[-0.05em]" style={{ color: 'var(--missi-text-primary)' }}>
                Limit check
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
              {activeBudgets.length > 0 ? 'A soft look at how your active limits are holding up.' : 'You have not set monthly limits yet.'}
            </p>
          </div>
          <div className="mt-8 space-y-4">
            {activeBudgets.length > 0 ? (
              activeBudgets.map((limit) => {
                const actual = report?.byCategory[limit.category] ?? 0
                const pct = limit.amount > 0 ? Math.min((actual / limit.amount) * 100, 100) : 0
                const ringColor = actual > limit.amount ? '#EF4444' : CATEGORY_COLORS[limit.category] || '#6366F1'
                return (
                  <div
                    key={limit.category}
                    className="flex items-center justify-between gap-4 rounded-[24px] px-4 py-4"
                    style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <BudgetRing pct={pct} color={ringColor} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium capitalize" style={{ color: 'var(--missi-text-secondary)' }}>
                          <CategoryGlyph category={limit.category} className="h-4 w-4" />
                          <span>{limit.category}</span>
                        </div>
                        <div className="mt-1 text-xs" style={{ color: 'var(--missi-text-muted)' }}>
                          {formatMoney(actual, currency)} of {formatMoney(limit.amount, currency)}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-medium" style={{ color: 'var(--missi-text-secondary)' }}>
                      {pct.toFixed(0)}%
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
                Add budgets in the budgets tab to get a live pacing view here.
              </p>
            )}
          </div>
        </GlassCard>

        <GlassCard delay={0.16} className="p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
                Recent activity
              </span>
              <h2 className="m-0 text-2xl font-medium tracking-[-0.05em]" style={{ color: 'var(--missi-text-primary)' }}>
                Latest entries
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
              The most recent money moments you logged this month.
            </p>
          </div>
          <div className="mt-8 space-y-3">
            {data?.recentEntries && data.recentEntries.length > 0 ? (
              data.recentEntries.slice(0, 6).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-4 rounded-[24px] px-4 py-4"
                  style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--missi-text-secondary)' }}>
                      <CategoryGlyph category={entry.category} className="h-4 w-4" />
                      <span className="truncate">{entry.description || entry.category}</span>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--missi-text-muted)' }}>
                      {entry.date}
                    </div>
                  </div>
                  <div className="text-sm font-medium" style={{ color: 'var(--missi-text-secondary)' }}>
                    {formatMoney(entry.amount, entry.currency)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
                No entries yet. Use the add expense button above to start the month.
              </p>
            )}
          </div>
        </GlassCard>
      </div>
    </motion.div>
  )
}

// ─── Entries Tab ──────────────────────────────────────────────────────────────

function EntriesTab({
  data,
  currency: _currency,
  month,
  onRefresh,
}: {
  data: DashboardData | null
  currency: string
  month: string
  onRefresh: () => void
}) {
  const entries = data?.recentEntries ?? []
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const monthLabel = formatYearMonth(month)

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/v1/budget/entries/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        toast.success('Entry deleted')
        onRefresh()
      } else {
        toast.error(json.error || 'Failed to delete')
      }
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl"
    >
      <GlassCard className="p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
              Entries
            </span>
            <h2 className="m-0 text-2xl font-medium tracking-[-0.05em] md:text-3xl" style={{ color: 'var(--missi-text-primary)' }}>
              All spending in {monthLabel}
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} captured so far.
          </p>
        </div>
        <div className="mt-8 space-y-3">
            {entries.length > 0 ? (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-4 rounded-[24px] px-4 py-4"
                  style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--missi-surface)', color: 'var(--missi-text-secondary)' }}>
                      <CategoryGlyph category={entry.category} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" style={{ color: 'var(--missi-text-secondary)' }}>
                        {entry.description || entry.category}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--missi-text-muted)' }}>
                        {entry.date} · {entry.category}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--missi-text-secondary)' }}>
                      {formatMoney(entry.amount, entry.currency)}
                    </span>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className="p-1.5 rounded-md transition-colors"
                      style={{
                        color: 'rgba(239,68,68,0.6)',
                        cursor: deletingId === entry.id ? 'default' : 'pointer',
                        opacity: deletingId === entry.id ? 0.5 : 1,
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-10 text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
                No entries for this month.
              </p>
            )}
        </div>
      </GlassCard>
    </motion.div>
  )
}

// ─── Budgets Tab ──────────────────────────────────────────────────────────────

function BudgetsTab({
  data,
  currency,
  month,
  onRefresh,
}: {
  data: DashboardData | null
  currency: string
  month: string
  onRefresh: () => void
}) {
  const [limits, setLimits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const report = data?.currentMonth
  const existingLimits = data?.settings?.limits ?? []
  const monthLabel = formatYearMonth(month)

  const handleSaveBudgets = async () => {
    const newLimits = Object.entries(limits)
      .filter(([, v]) => v !== '')
      .map(([cat, amount]) => ({
        category: cat,
        amount: parseFloat(amount),
        currency,
      }))

    if (newLimits.some((l) => !l.amount || l.amount <= 0)) {
      toast.error('Enter valid amounts')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/v1/budget/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limits: newLimits }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Budgets updated')
        onRefresh()
      } else {
        toast.error(json.error || 'Failed to update')
      }
    } catch {
      toast.error('Failed to update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl"
    >
      <GlassCard className="p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
              Budgets
            </span>
            <h2 className="m-0 text-2xl font-medium tracking-[-0.05em] md:text-3xl" style={{ color: 'var(--missi-text-primary)' }}>
              Monthly limits for {monthLabel}
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
            Set calm spending guardrails category by category.
          </p>
        </div>
        <div className="mt-8 space-y-5">
            {VALID_EXPENSE_CATEGORIES.map((cat) => {
              const existing = existingLimits.find((l) => l.category === cat)
              const actual = report?.byCategory[cat] ?? 0
              const budget = existing?.amount ?? 0
              const pct = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0

              return (
                <div
                  key={cat}
                  className="space-y-3 rounded-[24px] px-4 py-4"
                  style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm flex items-center gap-2" style={{ color: 'var(--missi-text-secondary)' }}>
                      <CategoryGlyph category={cat as ExpenseCategory} className="h-4 w-4" />
                      <span>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                    </span>
                    <span className="text-xs" style={{ color: 'var(--missi-text-muted)' }}>
                      {budget > 0 ? `${formatMoney(actual, currency)} / ${formatMoney(budget, currency)}` : formatMoney(actual, currency)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--missi-border)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: CATEGORY_COLORS[cat] || 'var(--missi-text-muted)',
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`Set ${cat} budget (${currencySymbol(currency)})`}
                    defaultValue={existing?.amount ?? ''}
                    onChange={(e) => setLimits((prev) => ({ ...prev, [cat]: e.target.value }))}
                    className="w-full rounded-[18px] px-4 py-3 text-sm"
                    style={{
                      background: 'var(--missi-surface)',
                      border: '1px solid var(--missi-border)',
                      color: 'var(--missi-text-secondary)',
                      outline: 'none',
                    }}
                  />
                </div>
              )
            })}
          <button
            onClick={handleSaveBudgets}
            disabled={saving}
            className="inline-flex min-w-[180px] items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition-colors"
            style={{
              background: saving ? 'var(--missi-surface)' : 'var(--missi-nav-text-active)',
              border: '1px solid var(--missi-border)',
              color: saving ? 'var(--missi-text-muted)' : 'var(--missi-bg)',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Budgets'}
          </button>
        </div>
      </GlassCard>
    </motion.div>
  )
}

// ─── Insights Tab ─────────────────────────────────────────────────────────────

function InsightsTab({
  data,
  currency,
  month,
  onRefresh,
}: {
  data: DashboardData | null
  currency: string
  month: string
  onRefresh: () => void
}) {
  const [regenerating, setRegenerating] = useState(false)
  const insight = data?.insight

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const res = await fetch('/api/v1/budget/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Insight regenerated')
        onRefresh()
      } else {
        toast.error(json.error || 'Failed to regenerate')
      }
    } catch {
      toast.error('Failed to regenerate')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl space-y-5"
    >
      <GlassCard className="p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
              Insights
            </span>
            <h2 className="m-0 text-2xl font-medium tracking-[-0.05em] md:text-3xl" style={{ color: 'var(--missi-text-primary)' }}>
              Spending insight for {formatYearMonth(month)}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors"
              style={{
                background: 'var(--missi-surface)',
                border: '1px solid var(--missi-border)',
                color: 'var(--missi-text-secondary)',
                cursor: regenerating ? 'default' : 'pointer',
              }}
            >
              {regenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {regenerating ? 'Generating...' : 'Regenerate'}
            </button>
          </div>
        </div>

        <div className="mt-8">
          {insight ? (
            <div className="space-y-6">
              <p className="max-w-3xl text-xl leading-9 tracking-[-0.03em]" style={{ color: 'var(--missi-text-secondary)', fontStyle: 'italic' }}>
                {insight.summary}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--missi-text-secondary)' }}>
                {insight.comparisonText && (
                  <div
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
                    style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
                  >
                    {insight.comparisonText}
                  </div>
                )}
                {insight.topCategory && (
                  <div className="inline-flex items-center gap-2">
                    <span>Top category:</span>
                    <span className="inline-flex items-center gap-2 font-medium" style={{ color: 'var(--missi-text-secondary)' }}>
                      <CategoryGlyph category={insight.topCategory} className="h-4 w-4" />
                      <span>{insight.topCategory}</span>
                    </span>
                    <span>{formatMoney(insight.topCategoryAmount, currency)}</span>
                  </div>
                )}
              </div>
              {insight.suggestions.length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
                    Suggestions
                  </span>
                  {insight.suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="rounded-[22px] px-4 py-3"
                      style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
                    >
                      <p className="m-0 text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
                        {s}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="py-10 text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
              No insight available. Add expenses and then generate an insight.
            </p>
          )}
        </div>
      </GlassCard>
    </motion.div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({
  data,
  onRefresh,
}: {
  data: DashboardData | null
  onRefresh: () => void
}) {
  const [preferredCurrency, setPreferredCurrency] = useState(
    data?.settings?.preferredCurrency ?? DEFAULT_CURRENCY
  )
  const [defaultView, setDefaultView] = useState<BudgetTab>(
    (data?.settings?.defaultView as BudgetTab) ?? 'overview'
  )
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/v1/budget/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredCurrency, defaultView }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Settings saved')
        onRefresh()
      } else {
        toast.error(json.error || 'Failed to save')
      }
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl space-y-5"
    >
      <GlassCard className="p-6 md:p-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
              Settings
            </span>
            <h2 className="m-0 text-2xl font-medium tracking-[-0.05em] md:text-3xl" style={{ color: 'var(--missi-text-primary)' }}>
              Preferences
            </h2>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
              Preferred Currency
            </label>
            <div className="relative">
              <select
                value={preferredCurrency}
                onChange={(e) => setPreferredCurrency(e.target.value)}
                className="w-full appearance-none rounded-[20px] px-4 py-3 pr-16 text-sm"
                style={{
                  background: 'var(--missi-surface)',
                  border: '1px solid var(--missi-border)',
                  color: 'var(--missi-text-primary)',
                  outline: 'none',
                }}
              >
                {['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'SGD', 'CHF', 'CNY'].map((c) => (
                  <option key={c} value={c}>{c} — {currencySymbol(c)}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-6 flex items-center">
                <ChevronDown className="h-4 w-4" style={{ color: 'var(--missi-text-muted)' }} />
              </span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
              Default Tab
            </label>
            <div className="relative">
              <select
                value={defaultView}
                onChange={(e) => setDefaultView(e.target.value as BudgetTab)}
                className="w-full appearance-none rounded-[20px] px-4 py-3 pr-16 text-sm"
                style={{
                  background: 'var(--missi-surface)',
                  border: '1px solid var(--missi-border)',
                  color: 'var(--missi-text-primary)',
                  outline: 'none',
                }}
              >
                {TABS.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-6 flex items-center">
                <ChevronDown className="h-4 w-4" style={{ color: 'var(--missi-text-muted)' }} />
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex min-w-[170px] items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition-colors"
              style={{
                background: saving ? 'var(--missi-surface)' : 'var(--missi-nav-text-active)',
                border: '1px solid var(--missi-border)',
                color: saving ? 'var(--missi-text-muted)' : 'var(--missi-bg)',
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Export */}
      <GlassCard className="p-6 md:p-8">
        <div className="space-y-4">
          <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--missi-text-muted)' }}>
            Export
          </span>
          <p className="text-sm leading-6" style={{ color: 'var(--missi-text-secondary)' }}>
            Download your expense data as a CSV file.
          </p>
          <a
            href={`/api/v1/budget/export?month=${getCurrentYearMonth()}`}
            className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-colors"
            style={{
              background: 'var(--missi-surface)',
              border: '1px solid var(--missi-border)',
              color: 'var(--missi-text-secondary)',
              textDecoration: 'none',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
        </div>
      </GlassCard>
    </motion.div>
  )
}
