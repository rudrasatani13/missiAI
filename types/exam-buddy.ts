// ─── Exam Buddy Types ─────────────────────────────────────────────────────────

export type ExamTarget =
  | 'jee_mains'
  | 'jee_advanced'
  | 'neet'
  | 'upsc'
  | 'cbse_10'
  | 'cbse_12'
  | 'cat'
  | 'gate'

export type ExamSubject =
  | 'physics'
  | 'chemistry'
  | 'mathematics'
  | 'biology'
  | 'history'
  | 'geography'
  | 'polity'
  | 'economics'
  | 'english'
  | 'general_studies'
  | 'aptitude'

export type QuizDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'

export type QuizQuestionType = 'mcq' | 'true_false' | 'numerical'

export type ExamBuddySessionMode =
  | 'explanation'
  | 'quiz'
  | 'study_plan'
  | 'revision'
  | 'doubt'

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface ExamBuddyProfile {
  userId: string
  examTarget: ExamTarget
  targetYear: number | null
  weakSubjects: ExamSubject[]
  totalQuizzesCompleted: number
  totalCorrectAnswers: number
  totalQuestionsAttempted: number
  createdAt: number
  updatedAt: number
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export interface QuizQuestion {
  id: string
  questionText: string
  options: string[]          // 2-4 options; for numerical: empty
  correctAnswer: string      // option text or numerical answer
  explanation: string        // English explanation
  difficulty: QuizDifficulty
  subject: ExamSubject
  topic: string
  type: QuizQuestionType
}

export interface QuizSession {
  id: string
  userId: string
  examTarget: ExamTarget
  subject: ExamSubject
  topic: string
  difficulty: QuizDifficulty
  questions: QuizQuestion[]
  userAnswers: Record<string, string>  // questionId → answer
  score: number | null
  totalMarks: number | null
  completedAt: number | null
  createdAt: number
}

// ─── Weak Topics ──────────────────────────────────────────────────────────────

export interface WeakTopicRecord {
  topic: string
  subject: ExamSubject
  wrongCount: number
  lastAttemptedAt: number
}

// ─── Session Context (injected into system prompt) ────────────────────────────

export interface ExamBuddySessionContext {
  examTarget: ExamTarget
  mode: ExamBuddySessionMode
  currentSubject: ExamSubject | null
  currentTopic: string | null
}
