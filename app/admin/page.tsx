'use client'

import { useUser } from '@clerk/nextjs'
import { useAnalytics } from '@/hooks/useAnalytics'
import { calculateGrowthRate, formatCostUsd } from '@/lib/analytics/aggregator'
import type { DailyStats } from '@/types/analytics'

export const runtime = 'edge'

export default function AdminPage() {
  const { isLoaded } = useUser()
  const { snapshot, planBreakdown, isLoading, error, isForbidden, refresh, formatNumber } = useAnalytics()

  // ── Loading ─────────────────────────────────────────────────────────────
  if (!isLoaded || isLoading) {
    return (
      <div
        data-testid="admin-loading"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: 'rgba(255,255,255,0.5)',
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
        }}
      >
        Loading analytics...
      </div>
    )
  }

  // ── Forbidden ───────────────────────────────────────────────────────────
  if (isForbidden) {
    return (
      <div
        data-testid="admin-forbidden"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: 'rgba(255,255,255,0.5)',
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
        }}
      >
        Access denied
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        data-testid="admin-error"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: 'rgba(239,68,68,0.8)',
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
        }}
      >
        {error}
      </div>
    )
  }

  if (!snapshot) return null

  const today = snapshot.today
  const yesterday = snapshot.yesterday
  const last7 = snapshot.last7Days
  const lifetime = snapshot.lifetime
  const budgetUsd = typeof process !== 'undefined' ? (parseFloat(process.env.NEXT_PUBLIC_DAILY_BUDGET_USD ?? '5') || 5) : 5

  // ── Growth calculations ─────────────────────────────────────────────────
  const dauGrowth = calculateGrowthRate(today.uniqueUsers, yesterday.uniqueUsers)
  const voiceGrowth = calculateGrowthRate(today.voiceInteractions, yesterday.voiceInteractions)
  const costGrowth = calculateGrowthRate(today.totalCostUsd, yesterday.totalCostUsd)
  const actionsGrowth = calculateGrowthRate(today.actionsExecuted, yesterday.actionsExecuted)

  // ── Plan breakdown ──────────────────────────────────────────────────────
  const plans = planBreakdown ?? lifetime.planBreakdown
  const totalPlanUsers = (plans.free ?? 0) + (plans.plus ?? 0) + (plans.pro ?? 0)
  const freePercent = totalPlanUsers > 0 ? ((plans.free ?? 0) / totalPlanUsers) * 100 : 100
  const plusPercent = totalPlanUsers > 0 ? ((plans.plus ?? 0) / totalPlanUsers) * 100 : 0
  const proPercent = totalPlanUsers > 0 ? ((plans.pro ?? 0) / totalPlanUsers) * 100 : 0

  // ── 7-day trend ─────────────────────────────────────────────────────────
  const maxVoice = Math.max(...last7.map(d => d.voiceInteractions), 1)

  // ── Revenue estimation ──────────────────────────────────────────────────
  const estimatedRevenue = (plans.plus ?? 0) * 9 + (plans.pro ?? 0) * 19

  // ── Relative time ───────────────────────────────────────────────────────
  const lastUpdatedStr = getRelativeTime(snapshot.generatedAt)

  return (
    <div
      data-testid="admin-dashboard"
      style={{
        minHeight: '100vh',
        background: '#000',
        fontFamily: "'Inter', sans-serif",
        color: '#fff',
        padding: '40px 20px',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div
          data-testid="admin-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 40,
          }}
        >
          <div>
            <h1
              data-testid="admin-title"
              style={{ fontSize: 20, fontWeight: 600, margin: 0 }}
            >
              missiAI Analytics
            </h1>
            <p
              data-testid="admin-last-updated"
              style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '6px 0 0' }}
            >
              Last updated: {lastUpdatedStr}
            </p>
          </div>
          <button
            data-testid="admin-refresh-btn"
            onClick={refresh}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '8px 16px',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            Refresh
          </button>
        </div>

        {/* ── Section 1: Today's KPIs ────────────────────────────────── */}
        <div
          data-testid="kpi-section"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            marginBottom: 32,
          }}
        >
          <KPICard
            testId="kpi-dau"
            label="Daily Active Users"
            value={formatNumber(today.uniqueUsers)}
            growth={dauGrowth}
            subtitle={null}
          />
          <KPICard
            testId="kpi-voice"
            label="Voice Interactions"
            value={formatNumber(today.voiceInteractions)}
            growth={voiceGrowth}
            subtitle={null}
          />
          <KPICard
            testId="kpi-cost"
            label="API Cost Today"
            value={formatCostUsd(today.totalCostUsd)}
            growth={costGrowth}
            subtitle={`Budget: $${budgetUsd.toFixed(2)}`}
          />
          <KPICard
            testId="kpi-actions"
            label="Actions Executed"
            value={formatNumber(today.actionsExecuted)}
            growth={actionsGrowth}
            subtitle={`Lifetime: ${formatNumber(lifetime.totalInteractions)}`}
          />
        </div>

        {/* ── Section 2: Plan Breakdown ──────────────────────────────── */}
        <SectionTitle title="Plan Breakdown" testId="section-plan-breakdown" />
        <div
          data-testid="plan-breakdown"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 32,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              Total Users: {totalPlanUsers}
            </span>
          </div>
          {/* Bar */}
          <div
            data-testid="plan-bar"
            style={{
              height: 28,
              borderRadius: 6,
              overflow: 'hidden',
              display: 'flex',
              background: 'rgba(255,255,255,0.06)',
            }}
          >
            {freePercent > 0 && (
              <div
                data-testid="plan-bar-free"
                style={{
                  width: `${freePercent}%`,
                  background: 'rgba(156,163,175,0.5)',
                  transition: 'width 0.3s',
                }}
              />
            )}
            {plusPercent > 0 && (
              <div
                data-testid="plan-bar-plus"
                style={{
                  width: `${plusPercent}%`,
                  background: 'rgba(139,92,246,0.6)',
                  transition: 'width 0.3s',
                }}
              />
            )}
            {proPercent > 0 && (
              <div
                data-testid="plan-bar-pro"
                style={{
                  width: `${proPercent}%`,
                  background: 'rgba(245,158,11,0.6)',
                  transition: 'width 0.3s',
                }}
              />
            )}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
            <PlanLegend color="rgba(156,163,175,0.5)" label="Free" count={plans.free ?? 0} percent={freePercent} testId="plan-legend-free" />
            <PlanLegend color="rgba(139,92,246,0.6)" label="Plus" count={plans.plus ?? 0} percent={plusPercent} testId="plan-legend-plus" />
            <PlanLegend color="rgba(245,158,11,0.6)" label="Pro" count={plans.pro ?? 0} percent={proPercent} testId="plan-legend-pro" />
          </div>
        </div>

        {/* ── Section 3: 7-Day Trend ─────────────────────────────────── */}
        <SectionTitle title="7-Day Trend" testId="section-7day-trend" />
        <div
          data-testid="trend-chart"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 32,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160 }}>
            {last7.map((day, i) => {
              const heightPct = (day.voiceInteractions / maxVoice) * 100
              const isToday = i === 0
              const dayLabel = getDayLabel(day.date)
              return (
                <div
                  key={day.date}
                  data-testid={`trend-bar-${i}`}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                  }}
                >
                  <div
                    title={`${day.voiceInteractions} voice interactions`}
                    style={{
                      width: '100%',
                      maxWidth: 48,
                      height: `${Math.max(heightPct, 4)}%`,
                      background: isToday ? 'rgba(139,92,246,0.9)' : 'rgba(139,92,246,0.6)',
                      borderRadius: '6px 6px 0 0',
                      transition: 'height 0.3s, background 0.2s',
                      minHeight: 4,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      color: isToday ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                      marginTop: 6,
                      fontWeight: isToday ? 600 : 400,
                    }}
                  >
                    {dayLabel}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Section 4: Cost Breakdown Table ────────────────────────── */}
        <SectionTitle title="Cost Breakdown" testId="section-cost-breakdown" />
        <div
          data-testid="cost-table"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 32,
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={thStyle}>Date</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total Requests</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Cost (USD)</th>
              </tr>
            </thead>
            <tbody>
              {last7.map((day, i) => (
                <tr
                  key={day.date}
                  data-testid={`cost-row-${i}`}
                  style={{
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <td style={tdStyle}>{day.date}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{day.totalRequests}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCostUsd(day.totalCostUsd)}</td>
                </tr>
              ))}
              {/* Total row */}
              <tr
                data-testid="cost-row-total"
                style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
              >
                <td style={{ ...tdStyle, fontWeight: 600 }}>Total</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                  {last7.reduce((sum, d) => sum + d.totalRequests, 0)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                  {formatCostUsd(last7.reduce((sum, d) => sum + d.totalCostUsd, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Section 5: Lifetime Stats ──────────────────────────────── */}
        <SectionTitle title="Lifetime Stats" testId="section-lifetime-stats" />
        <div
          data-testid="lifetime-stats"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 32,
          }}
        >
          <StatCard testId="lifetime-users" label="Total Users Ever" value={formatNumber(lifetime.totalUsers)} />
          <StatCard testId="lifetime-interactions" label="Total Interactions" value={formatNumber(lifetime.totalInteractions)} />
          <StatCard testId="lifetime-revenue" label="Total Revenue (est.)" value={`$${estimatedRevenue}`} />
        </div>

        {/* ── Section 6: Recent Activity ─────────────────────────────── */}
        <SectionTitle title="Recent Activity" testId="section-recent-activity" />
        <div
          data-testid="recent-activity"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <ActivityItem
            testId="activity-voice"
            text={`${today.voiceInteractions} voice interactions today`}
          />
          <ActivityItem
            testId="activity-signups"
            text={`${today.newSignups} new users joined`}
          />
          <ActivityItem
            testId="activity-actions"
            text={`${today.actionsExecuted} actions executed`}
          />
          <ActivityItem
            testId="activity-cost"
            text={`API spend: ${formatCostUsd(today.totalCostUsd)}`}
          />
          <ActivityItem
            testId="activity-errors"
            text={`${today.errorCount} errors recorded`}
            isLast
          />
        </div>
      </div>
    </div>
  )
}

// ─── Sub Components ───────────────────────────────────────────────────────────

function KPICard({
  testId,
  label,
  value,
  growth,
  subtitle,
}: {
  testId: string
  label: string
  value: string
  growth: number
  subtitle: string | null
}) {
  const isPositive = growth >= 0
  const growthStr = growth === 0 ? '0%' : `${isPositive ? '+' : ''}${growth.toFixed(1)}%`
  const growthColor = isPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'
  const growthTextColor = isPositive ? 'rgb(16,185,129)' : 'rgb(239,68,68)'

  return (
    <div
      data-testid={testId}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.4)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          data-testid={`${testId}-value`}
          style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}
        >
          {value}
        </span>
        <span
          data-testid={`${testId}-growth`}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 20,
            background: growthColor,
            color: growthTextColor,
            fontWeight: 500,
          }}
        >
          {growthStr}
        </span>
      </div>
      {subtitle && (
        <div
          data-testid={`${testId}-subtitle`}
          style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}
        >
          {subtitle}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ title, testId }: { title: string; testId: string }) {
  return (
    <h2
      data-testid={testId}
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 12,
        letterSpacing: '0.02em',
      }}
    >
      {title}
    </h2>
  )
}

function PlanLegend({
  color,
  label,
  count,
  percent,
  testId,
}: {
  color: string
  label: string
  count: number
  percent: number
  testId: string
}) {
  return (
    <div data-testid={testId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
        {label}: {count} ({percent.toFixed(0)}%)
      </span>
    </div>
  )
}

function StatCard({ testId, label, value }: { testId: string; label: string; value: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.4)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <span
        data-testid={`${testId}-value`}
        style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}
      >
        {value}
      </span>
    </div>
  )
}

function ActivityItem({ testId, text, isLast = false }: { testId: string; text: string; isLast?: boolean }) {
  return (
    <div
      data-testid={testId}
      style={{
        padding: '10px 0',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
      }}
    >
      {text}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'rgba(255,255,255,0.4)',
  fontWeight: 500,
  textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 13,
  color: 'rgba(255,255,255,0.7)',
}

function getDayLabel(dateStr: string): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const date = new Date(dateStr + 'T00:00:00Z')
  return days[date.getUTCDay()]
}

function getRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
