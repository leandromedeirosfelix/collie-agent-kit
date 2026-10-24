import type { McpToolResult } from 'claude-code'

import type { CollieReview, CollieSnapshot } from '../../types'

/** The Collie server's tools as Claude Code names them: `mcp__plugin_collie_collie__review_get`, `mcp__collie__review_get`. */
export const COLLIE_TOOL = /^mcp__(?:.*_)?collie__[a-z_]+$/

export const shortName = (tool: string): string => tool.slice(tool.lastIndexOf('__') + 2)

const WORDS: Record<string, string> = {
  collie_connection_status: 'Checked the connection',
  collie_connect: 'Started connecting',
  collie_disconnect: 'Disconnected',
  review_list: 'Listed reviews',
  review_get: 'Read the review overview',
  protocol_get: 'Read the protocol',
  protocol_set: 'Saved the protocol',
  criteria_get: 'Read the eligibility criteria',
  criteria_set: 'Saved the eligibility criteria',
  search_build: 'Built a search strategy',
  search_count: 'Counted search hits',
  search_import: 'Imported search results',
  duplicates_list: 'Listed duplicate groups',
  duplicates_suggest: 'Suggested on duplicates',
  screening_queue: 'Fetched records to screen',
  screening_decide: 'Recorded a screening vote',
  ai_suggest: 'Wrote an AI screening suggestion',
  ai_suggestions_list: 'Listed AI suggestions',
  ai_screen_run: 'Ran the AI Reviewer',
  ai_status: 'Checked AI readiness',
  pdf_text: 'Read a full text',
  ai_extraction_put: 'Wrote AI extraction answers',
  outcome_data_put: 'Saved outcome data',
  rob_assess: 'Drafted a risk-of-bias assessment',
  outcome_analyze: 'Ran a meta-analysis in R',
  analysis_run: 'Ran an R analysis',
  grade_get: 'Read GRADE',
  grade_set: 'Saved a GRADE judgement',
  checklist_get: 'Read the PRISMA checklist',
}

/** A tool name in plain words: the known ones by hand, the rest from their name (`studies_list` → `Studies list`). */
export const plainName = (tool: string): string => {
  const known = WORDS[tool]
  if (known) return known
  const spaced = tool.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const NOT_CONNECTED = /^(Not connected to Collie|The saved Collie connection is no longer valid)/

export type Read = { kind: 'json'; value: unknown } | { kind: 'not-connected' } | { kind: 'error'; problem: string }

/** Reads a Collie tool result: its first text block as JSON, the server's "not connected" answer, or an error. */
export const readResult = (result: McpToolResult): Read => {
  const text = result.content.find(block => block.type === 'text')?.text ?? ''
  if (NOT_CONNECTED.test(text)) return { kind: 'not-connected' }
  // Only the error's head: it can quote the API, never record contents worth keeping.
  if (result.isError) return { kind: 'error', problem: text.split('\n')[0]?.slice(0, 120) || 'Collie answered an error' }
  try {
    return { kind: 'json', value: JSON.parse(text) }
  } catch {
    return { kind: 'error', problem: 'Collie answered something unexpected' }
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const at = (v: unknown, ...path: string[]): unknown => path.reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), v)

/** The pipeline from review_get's answer (GET /reviews/:id), plus the pending suggestions and the PRISMA summary. */
export const toReview = (id: number, overview: unknown, pending: unknown, checklist: unknown): CollieReview | null => {
  const title = at(overview, 'review', 'title')
  if (typeof title !== 'string') return null
  const done = num(at(checklist, 'summary', 'done'))
  const total = num(at(checklist, 'summary', 'total'))
  return {
    id,
    title,
    imported: num(at(overview, 'data', 'imported')) ?? 0,
    duplicatesRemoved: num(at(overview, 'data', 'duplicates', 'removable')) ?? 0,
    duplicatesUnresolved: num(at(overview, 'data', 'duplicates', 'unresolved')) ?? 0,
    screening: {
      total: num(at(overview, 'screening', 'total')) ?? 0,
      decided: num(at(overview, 'screening', 'mine', 'decided')) ?? 0,
      include: num(at(overview, 'screening', 'mine', 'include')) ?? 0,
      maybe: num(at(overview, 'screening', 'mine', 'maybe')) ?? 0,
      exclude: num(at(overview, 'screening', 'mine', 'exclude')) ?? 0,
    },
    fullText: num(at(overview, 'stages', 'fullText')),
    studies: num(at(overview, 'stages', 'studies')),
    robStudies: num(at(overview, 'stages', 'robStudies')),
    outcomes: num(at(overview, 'stages', 'outcomes')),
    graded: num(at(overview, 'stages', 'graded')),
    prisma: done !== null && total !== null ? { done, total } : null,
    pendingSuggestions: Array.isArray(pending) ? pending.length : null,
  }
}

/** The newest review that is not archived, from review_list's answer (GET /reviews, newest first). */
export const pickReview = (list: unknown): number | null => {
  if (!Array.isArray(list)) return null
  const open = list.find(r => isObj(r) && num(r.id) !== null && !r.archivedAt) as Obj | undefined
  return open ? (open.id as number) : null
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** The status line: `Collie · <review> · screening 120/450`. */
export const statusText = (s: CollieSnapshot): string => {
  if (s.connection === 'not-connected') return 'Collie · not connected (ask Claude to run collie_connect)'
  if (s.connection === 'unreachable') return 'Collie · not reachable'
  if (s.connection === 'unknown') return 'Collie'
  if (!s.review) return 'Collie · connected · no review open'
  const { decided, total } = s.review.screening
  return `Collie · ${clip(s.review.title, 40)} · screening ${decided}/${total}`
}

/** A text progress bar, `▰▰▰▱▱▱▱▱▱▱` for 3 of 10; empty bar when the total is unknown or zero. */
export const bar = (done: number | null, total: number | null, width = 10): string => {
  const filled = done !== null && total ? Math.round((Math.min(Math.max(done, 0), total) / total) * width) : 0
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

/** HH:MM:SS of a time in ms, in the machine's zone. */
export const clockTime = (ms: number): string => new Date(ms).toTimeString().slice(0, 8)
