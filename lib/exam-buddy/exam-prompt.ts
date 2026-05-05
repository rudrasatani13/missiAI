// ─── Exam Buddy System Prompt Modifier ───────────────────────────────────────

import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'
import type { ExamBuddyProfile, ExamBuddySessionContext, ExamTarget } from '@/types/exam-buddy'

const MAX_MODIFIER_LEN = 3000

// ─── Exam Display Names ───────────────────────────────────────────────────────

const EXAM_NAMES: Record<ExamTarget, string> = {
  jee_mains:    'JEE Mains',
  jee_advanced: 'JEE Advanced',
  neet:         'NEET',
  upsc:         'UPSC',
  cbse_10:      'CBSE Class 10',
  cbse_12:      'CBSE Class 12',
  cat:          'CAT',
  gate:         'GATE',
}

// ─── Mode Instructions ────────────────────────────────────────────────────────

const MODE_INSTRUCTIONS: Record<ExamBuddySessionContext['mode'], string> = {
  explanation:
    'The user wants a concept explained. Break it down simply with examples relevant to their exam.',
  quiz:
    'The user is in quiz mode. Generate questions, wait for answers, then explain the correct answer in English.',
  study_plan:
    'Create a realistic, prioritized study plan based on the user\'s exam target and weak subjects.',
  revision:
    'Help the user revise key concepts quickly. Focus on high-yield topics for their exam.',
  doubt:
    'The user has a doubt or question. Answer clearly and precisely.',
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildExamBuddyModifier(
  profile: ExamBuddyProfile | null,
  context: ExamBuddySessionContext,
): string {
  const examName = EXAM_NAMES[context.examTarget] ?? context.examTarget
  const modeInstruction = MODE_INSTRUCTIONS[context.mode] ?? MODE_INSTRUCTIONS.doubt

  const lines: string[] = [
    '── EXAM BUDDY MODE ──',
    `Exam Target: ${examName}`,
    '',
    'LANGUAGE RULES:',
    '- Respond in clear, simple English only.',
    '- Keep the tone warm and encouraging, like a supportive tutor.',
    '- Use plain language — avoid jargon unless you define it first.',
    '',
    `CURRENT MODE: ${modeInstruction}`,
    '',
    'TEACHING APPROACH:',
    '- Always relate concepts back to the exam pattern and marking scheme.',
    '- Highlight common mistakes and traps relevant to this exam.',
    '- Provide memory tricks (mnemonics) when they help.',
    '- For numerical problems, show the step-by-step method clearly.',
  ]

  // Subject context
  if (context.currentSubject) {
    lines.push('', `Current Subject: ${context.currentSubject}`)
  }
  if (context.currentTopic) {
    lines.push(`Current Topic: ${context.currentTopic}`)
  }

  // Weak subjects from profile (sanitized)
  if (profile && profile.weakSubjects.length > 0) {
    const weakList = profile.weakSubjects.slice(0, 5).join(', ')
    const sanitizedWeak = sanitizeMemories(weakList).slice(0, 200)
    if (sanitizedWeak) {
      lines.push('', `User's Weak Areas: ${sanitizedWeak}`, 'Focus extra attention on these topics when relevant.')
    }
  }

  // Study stats for personalization
  if (profile) {
    if (profile.totalQuizzesCompleted > 0) {
      lines.push(`Total Quizzes Completed: ${profile.totalQuizzesCompleted}`)
    }
  }

  lines.push(
    '',
    'QUIZ RULES (when in quiz mode):',
    '- Present one question at a time unless the user asks for a full quiz.',
    '- After each answer, explain in English why it is correct or incorrect.',
    '- Offer brief, sincere encouragement: "Correct!" or "Not quite — here is why..."',
    '',
    'MEMORY INTEGRATION:',
    '- If you know the user\'s preparation timeline from their life graph, factor it into the urgency of your advice.',
    '- Reference their past study sessions naturally if relevant.',
    '',
    'NEVER:',
    '- Use any non-English language.',
    '- Ignore the exam-specific context and give generic answers.',
    '- Be discouraging — always end on a positive, actionable note.',
    '── END EXAM BUDDY MODE ──',
  )

  const modifier = lines.join('\n')
  return modifier.slice(0, MAX_MODIFIER_LEN)
}
