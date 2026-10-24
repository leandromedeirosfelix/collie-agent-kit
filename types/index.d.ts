// The collie plugin's state contract: what its live pane and status line draw from.
// Counts and titles only: no record contents, names, e-mails or tokens are ever kept here.

/** One Collie MCP tool call the agent made, as the activity feed shows it. */
export type CollieCall = {
  /** The tool_use id of the call. */
  id: string
  /** The tool's short name on the Collie server (`review_get`). */
  tool: string
  status: 'running' | 'ok' | 'error' | 'denied'
  /** When it started, ms since the epoch. */
  at: number
}

/** The active review's pipeline, read from review_get, ai_suggestions_list and checklist_get. */
export type CollieReview = {
  id: number
  title: string
  /** review_get data.imported */
  imported: number
  /** review_get data.duplicates.removable (records a resolved group removes) */
  duplicatesRemoved: number
  /** review_get data.duplicates.unresolved (groups still to confirm) */
  duplicatesUnresolved: number
  /** review_get screening (title/abstract, this account's votes) */
  screening: { total: number; decided: number; include: number; maybe: number; exclude: number }
  /** review_get stages; null where blind mode hides it from this account */
  fullText: number | null
  studies: number | null
  robStudies: number | null
  outcomes: number | null
  graded: number | null
  /** checklist_get summary; null when it could not be read */
  prisma: { done: number; total: number } | null
  /** ai_suggestions_list status=pending (title/abstract); null when it could not be read */
  pendingSuggestions: number | null
}

export type CollieSnapshot = {
  connection: 'unknown' | 'connected' | 'not-connected' | 'unreachable'
  /** When it was last read, ms since the epoch. */
  checkedAt: number | null
  review: CollieReview | null
  /** A short, content-free reason when the last read failed. */
  problem: string | null
}

declare module 'claude-code' {
  interface PluginState {
    collie: {
      feed: CollieCall[]
      snapshot: CollieSnapshot
      /** The review the agent last worked on (a call's review_id), else the newest open one. */
      reviewId: number | null
    }
  }
}
