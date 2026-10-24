import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { CollieCall, CollieReview, CollieSnapshot } from '../../types'
import { APP_URL, INK, MARK_PNG, MARK_SVG, PAPER, TAGLINE } from './brand'
import { bar, clockTime, COLLIE_TOOL, pickReview, plainName, readResult, shortName, statusText, toReview } from './format'

// Collie live: shows, inside Claude Code, what the agent does in Collie over MCP. It only watches:
// the tool.call hook awaits next(e) and hands its result back untouched (hooks.json's command hook gates screening_decide).

const PANE = 'collie'
const FEED_MAX = 15
const MIN_GAP_MS = 10_000 // never read Collie more often than this
const AFTER_CALL_MS = 1_500 // a burst of calls is read once, after it
const TICK_MS = 45_000 // while the pane is placed
const NO_BAR = ' '.repeat(10) // a stage without a ratio keeps the column
const CHIP = { ok: 'success', error: 'error', denied: 'warning', running: 'subtle' } as const // feed status -> theme color

const EMPTY: CollieSnapshot = { connection: 'unknown', checkedAt: null, review: null, problem: null }
const feed = atom({ plugin: 'collie', key: 'feed' } as const, [])
const snapshot = atom({ plugin: 'collie', key: 'snapshot' } as const, EMPTY)
const reviewId = atom({ plugin: 'collie', key: 'reviewId' } as const, null)

type $ = EngineInterface

// Module state is only throttling: a hot reload losing it costs one extra read.
let server: string | null = null
let lastReadAt = -Infinity
let inFlight: Promise<void> | null = null
let pending: Timer | null = null

async function collieServer($: $): Promise<string> {
  if (server) return server
  const joined = await $.mcp.connect('collie')
  // The name /mcp lists this plugin's server under; connect says it, else the usual spelling.
  server = joined.isConnected ? joined.server : 'plugin:collie:collie'
  return server
}

async function call($: $, tool: string, args: Record<string, unknown> = {}) {
  try {
    return readResult(await $.mcp.call(await collieServer($), tool, args))
  } catch {
    return { kind: 'error', problem: 'The Collie MCP server did not answer' } as const
  }
}

async function readReview($: $, id: number): Promise<CollieReview | null> {
  const [overview, waiting, checklist] = await Promise.all([
    call($, 'review_get', { review_id: id }),
    call($, 'ai_suggestions_list', { review_id: id, status: 'pending' }),
    call($, 'checklist_get', { review_id: id }),
  ])
  if (overview.kind !== 'json') return null
  const value = (r: typeof waiting) => (r.kind === 'json' ? r.value : null)
  return toReview(id, overview.value, value(waiting), value(checklist))
}

async function readCollie($: $): Promise<CollieSnapshot> {
  const now = await $.clock.now()
  const status = await call($, 'collie_connection_status')
  const state = status.kind === 'json' && typeof status.value === 'object' && status.value !== null ? (status.value as Record<string, unknown>) : null
  if (status.kind === 'not-connected' || (state && state.connected !== true)) {
    const connection = state?.state === 'unreachable' ? 'unreachable' : 'not-connected'
    return { connection, checkedAt: now, review: null, problem: null }
  }
  if (status.kind === 'error') return { connection: 'unreachable', checkedAt: now, review: null, problem: status.problem }

  let id = await read($, reviewId)
  if (id === null) {
    const list = await call($, 'review_list')
    id = list.kind === 'json' ? pickReview(list.value) : null
    if (id !== null) await update($, reviewId, () => id)
  }
  const review = id === null ? null : await readReview($, id)
  return { connection: 'connected', checkedAt: now, review, problem: id !== null && !review ? 'Could not read the review' : null }
}

/** Reads Collie once (at most every MIN_GAP_MS unless forced) and redraws the pane and the status line. */
function refresh($: $, isForced = false): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    const now = await $.clock.now()
    if (!isForced && now - lastReadAt < MIN_GAP_MS) return
    lastReadAt = now
    const next = await readCollie($)
    await update($, snapshot, () => next)
    $.ui.status(statusText(next))
  })()
    .catch(() => undefined) // a failed read leaves the last snapshot standing
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** One read shortly after a burst of Collie calls, from a timer so it outlives the call's dispatch. */
function refreshSoon($: $) {
  pending?.cancel()
  pending = $.clock.after(AFTER_CALL_MS, () => {
    pending = null
    void refresh($)
  })
}

// The only tools the pane reads, all read-only on the Collie server (annotations: READ).
const READS = new Set(['collie_connection_status', 'review_list', 'review_get', 'ai_suggestions_list', 'checklist_get'])

const replace = (list: CollieCall[], id: string, patch: Partial<CollieCall>) => list.map(c => (c.id === id ? { ...c, ...patch } : c))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'collie', description: 'Show what your agent is doing in Collie (live pane)' })
    $.clock.every(TICK_MS, () => {
      void $.ui.panes().then(panes => {
        if (panes.some(p => p.id === PANE && p.isPlaced)) void refresh($)
      })
    })
    refreshSoon($) // the status line, once the session is up
    return next(e)
  })

  on('command.run', { command: 'collie' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Collie', focus: true })
    void refresh($, true)
    return { text: 'Collie pane opened.' }
  })

  // $.mcp.call runs as a tool call, which asks permission headless or interactive: the pane's own reads
  // (read-only tools, raised by this plugin alone) are the plugin's grant, as $.mcp.call documents. Everything else is untouched.
  on('tool.check', { tool: COLLIE_TOOL }, ($, e, next) =>
    next.origin.plugin === $.plugin.name && READS.has(shortName(e.tool))
      ? { decision: 'allow' as const, reason: 'Collie live pane: read-only status read' }
      : next(e),
  ).catch(($, e, next) => next(e))

  on('tool.call', { tool: COLLIE_TOOL }, async ($, e, next) => {
    if (next.origin.plugin === $.plugin.name) return next(e) // the pane's own reads are not the agent's activity
    const id = e.tool_use_id
    const tool = shortName(e.tool)
    const args = e as Record<string, unknown>
    const at = await $.clock.now()
    await update($, feed, list => [...list, { id, tool, status: 'running' as const, at }].slice(-FEED_MAX))
    if (typeof args.review_id === 'number') {
      const rid = args.review_id
      await update($, reviewId, () => rid)
    }
    const ran = await next(e)
    const status = ran.deny !== undefined ? 'denied' : ran.isError ? 'error' : 'ok'
    await update($, feed, list => replace(list, id, { status }))
    refreshSoon($)
    return ran
  }).catch(($, e, next) => next(e)) // watching only: a failure here never changes the call (replays it when next already ran)

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const calls = await read($, feed)
    const r = snap.review

    // The mark where the surface draws pictures: Image on the terminal (blank where the terminal cannot), Svg on the
    // remote surfaces; elsewhere the header is the wordmark alone.
    const mark = (() => {
      if (e.surface === 'terminal') {
        const { Image } = $.ui.resolve(e)
        return <Image key="collie-mark" source={{ png: MARK_PNG }} columns={4} rows={2} alt=" " />
      }
      if (e.surface === 'desktop' || e.surface === 'vscode' || e.surface === 'mobile') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={MARK_SVG} alt="Collie logo" width={32} height={32} />
      }
      return null
    })()

    const header = (
      <Box flexDirection="row" gap={1} alignItems="center">
        {mark}
        <Box flexDirection="column">
          <Text color={INK} backgroundColor={PAPER} weight="bold" size="heading">
            {' Collie '}
          </Text>
          <Text dimColor size="caption">
            {TAGLINE}
          </Text>
        </Box>
      </Box>
    )

    const row = (label: string, value: string, done?: number | null, total?: number | null) => (
      <Text>
        {label.padEnd(13)}
        <Text color="success">{done === undefined ? NO_BAR : bar(done, total ?? null)}</Text> {value}
      </Text>
    )
    const count = (n: number | null, unit = '') => (n === null ? 'hidden (blind mode)' : `${n}${unit}`)

    const connection =
      snap.connection === 'connected' ? (
        <Text color="success">● Connected</Text>
      ) : snap.connection === 'unknown' ? (
        <Text dimColor>Checking the connection…</Text>
      ) : (
        <Box flexDirection="column">
          <Text color="warning">{snap.connection === 'unreachable' ? 'Collie is not reachable' : 'Not connected to Collie'}</Text>
          <Text dimColor>Ask Claude to run collie_connect, then approve the code in your browser.</Text>
        </Box>
      )

    const pipeline = r && (
      <Box flexDirection="column" marginTop={1}>
        <Text weight="bold">{r.title}</Text>
        {row('Imported', `${r.imported}`)}
        {row('Duplicates', `${r.duplicatesRemoved} removed${r.duplicatesUnresolved ? `, ${r.duplicatesUnresolved} groups to confirm` : ''}`)}
        {row(
          'Screening',
          `${r.screening.decided}/${r.screening.total} decided · include ${r.screening.include} · exclude ${r.screening.exclude} · maybe ${r.screening.maybe} · pending ${Math.max(0, r.screening.total - r.screening.decided)}`,
          r.screening.decided,
          r.screening.total,
        )}
        {row('Full text', count(r.fullText, ' records'))}
        {row('Extraction', count(r.studies, ' studies'))}
        {row('Risk of bias', count(r.robStudies, ' studies assessed'), r.robStudies, r.studies)}
        {r.outcomes === null
          ? row('Analysis', count(null))
          : row('Analysis', `${r.outcomes} outcomes · ${r.graded ?? 0} graded`, r.graded ?? 0, r.outcomes)}
        {r.prisma ? row('PRISMA', `${r.prisma.done}/${r.prisma.total} items done`, r.prisma.done, r.prisma.total) : row('PRISMA', 'not read')}
        {r.pendingSuggestions !== null && (
          <Text color={r.pendingSuggestions ? 'warning' : undefined}>AI suggestions awaiting your decision: {r.pendingSuggestions}</Text>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {header}
        <Box marginTop={1}>{connection}</Box>
        {snap.connection === 'connected' && !r && <Text dimColor>{snap.problem ?? 'No review open yet.'}</Text>}
        {pipeline}
        <Box flexDirection="column" marginTop={1}>
          <Text weight="bold">Recent Collie activity</Text>
          {calls.length === 0 && <Text dimColor>No Collie tool calls yet.</Text>}
          {[...calls].reverse().map(c => (
            <Text>
              <Text dimColor>{clockTime(c.at)}</Text>{' '}
              <Text color="inverseText" backgroundColor={CHIP[c.status]}>{` ${c.status.padEnd(7)}`}</Text>{' '}
              <Text dimColor={c.status === 'ok'}>{plainName(c.tool)}</Text>
            </Text>
          ))}
        </Box>
        <Box marginTop={1} gap={1}>
          <Button key="refresh" label="Refresh" onPress={() => refresh($, true)} />
          {snap.checkedAt !== null && <Text dimColor>updated {clockTime(snap.checkedAt)}</Text>}
        </Box>
        <Box marginTop={1}>
          <Link href={APP_URL} label="app.colliesr.com" />
        </Box>
      </Box>
    )
  })
}
