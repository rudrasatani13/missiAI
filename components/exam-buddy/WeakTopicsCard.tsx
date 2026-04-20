'use client'

import type { WeakTopicRecord, ExamSubject } from '@/types/exam-buddy'

interface WeakTopicsCardProps {
  topics: WeakTopicRecord[]
  onPractice: (topic: string, subject: ExamSubject) => void
}

export function WeakTopicsCard({ topics, onPractice }: WeakTopicsCardProps) {
  if (topics.length === 0) return null

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3">
        {topics.slice(0, 5).map((t) => (
          <div
            key={`${t.subject}-${t.topic}`}
            className="flex items-center justify-between rounded-[22px] px-4 py-4"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {t.topic}
              </p>
              <p className="text-[11px] font-light mt-1 capitalize" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {t.subject.replace('_', ' ')} · {t.wrongCount} miss{t.wrongCount !== 1 ? 'es' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onPractice(t.topic, t.subject as ExamSubject)}
              className="shrink-0 ml-3 px-3 py-2 rounded-full text-xs font-medium transition-colors"
              style={{
                background: 'rgba(255,255,255,0.96)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#0a0a0f',
                cursor: 'pointer',
              }}
            >
              Practice
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
