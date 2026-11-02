// Questions a business asks when someone books, and the guest's answers. No
// imports: the editor, the booking form and the server all check the same rules.

export type QuestionKind = 'short' | 'long' | 'choice' | 'phone'

export interface BookingQuestion {
  id: string
  label: string
  kind: QuestionKind
  required: boolean
  /** For 'choice' only. */
  options?: string[]
}

/** Stored on the booking with the question's wording at the time, so later edits don't rewrite history. */
export interface BookingAnswer {
  label: string
  value: string
}

export const MAX_QUESTIONS = 8
export const MAX_OPTIONS = 10
const KINDS: QuestionKind[] = ['short', 'long', 'choice', 'phone']
const ID_RE = /^[A-Za-z0-9_-]{1,24}$/
const ANSWER_LIMIT: Record<QuestionKind, number> = {
  short: 200,
  long: 2000,
  choice: 120,
  phone: 40,
}

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  short: 'Short answer',
  long: 'Paragraph',
  choice: 'Pick one',
  phone: 'Phone number',
}

function clean(value: unknown, max: number): string {
  // Control characters (newlines, tabs, NULs) become spaces: these answers are one line.
  // eslint-disable-next-line no-control-regex
  const oneLine = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')
  return oneLine.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Tidy questions from the editor. Drops blank ones; null if the shape is wrong. */
export function normalizeQuestions(input: unknown): BookingQuestion[] | null {
  if (input == null) return []
  if (!Array.isArray(input) || input.length > MAX_QUESTIONS) return null
  const out: BookingQuestion[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    const q = raw as Partial<BookingQuestion>
    const label = clean(q?.label, 140)
    if (!label) continue
    const kind = KINDS.includes(q?.kind as QuestionKind) ? (q.kind as QuestionKind) : 'short'
    let id = String(q?.id ?? '')
    if (!ID_RE.test(id) || seen.has(id))
      id = `q${out.length + 1}${Math.random().toString(36).slice(2, 7)}`
    seen.add(id)
    const question: BookingQuestion = { id, label, kind, required: Boolean(q?.required) }
    if (kind === 'choice') {
      const options = [
        ...new Set(
          (Array.isArray(q?.options) ? q.options : []).map((o) => clean(o, 80)).filter(Boolean),
        ),
      ].slice(0, MAX_OPTIONS)
      if (options.length < 2) return null
      question.options = options
    }
    out.push(question)
  }
  return out
}

/**
 * Check a guest's answers against the questions. Returns them in question order
 * (skipping unanswered optional ones), or the first problem in plain words.
 */
export function collectAnswers(
  questions: BookingQuestion[],
  raw: Record<string, unknown> | null | undefined,
): { ok: true; answers: BookingAnswer[] } | { ok: false; error: string } {
  const answers: BookingAnswer[] = []
  for (const q of questions) {
    const rawValue = raw?.[q.id]
    const value =
      q.kind === 'long'
        ? String(rawValue ?? '')
            .replace(/\r\n/g, '\n')
            .trim()
            .slice(0, ANSWER_LIMIT.long)
        : clean(rawValue, ANSWER_LIMIT[q.kind])
    if (!value) {
      if (q.required) return { ok: false, error: `Please answer “${q.label}”.` }
      continue
    }
    if (q.kind === 'choice' && !(q.options ?? []).includes(value)) {
      return { ok: false, error: `Please pick an option for “${q.label}”.` }
    }
    if (q.kind === 'phone' && !/^[+()\d\s.-]{6,}$/.test(value)) {
      return { ok: false, error: `“${q.label}” doesn’t look like a phone number.` }
    }
    answers.push({ label: q.label, value })
  }
  return { ok: true, answers }
}
