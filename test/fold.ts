// Reference fold of a run file into the core run state (SPEC.md "Run state").
// Input is the file text and the reader's clock; output validates against schema/v0/run-state.schema.json.

export const ABANDONED_AFTER_MS = 60 * 60 * 1000

// biome-ignore lint/suspicious/noExplicitAny: events are untrusted JSON, read defensively
type Json = Record<string, any>
type Link = { rel: string; url: string; title?: string }

export function foldRun(text: string, now: Date): Json {
  const lines = text.split('\n')
  if (!text.endsWith('\n')) lines.pop() // incomplete last line
  const tasks = new Map<string, Json>()
  const seen = new Set<string>()
  const finished: Json = { succeeded: [], failed: [], cancelled: [], skipped: [] }
  const attentions: Json[] = []
  const links: Link[] = []
  const gaps: { from: number; to: number }[] = []
  const state: Json = { v: 1, status: 'running' }
  let lastSeq = 0
  let updated: string | undefined

  const addLinks = (into: Link[], more?: Link[]) => {
    for (const l of more ?? [])
      if (!into.some((x) => x.rel === l.rel && x.url === l.url)) into.push(l)
  }

  for (const line of lines) {
    let e: Json
    try {
      e = JSON.parse(line)
    } catch {
      continue // unparseable line is skipped
    }
    if (typeof e?.seq !== 'number' || e.seq <= lastSeq) continue // duplicate or regress
    if (e.seq > lastSeq + 1) gaps.push({ from: lastSeq + 1, to: e.seq - 1 })
    lastSeq = e.seq
    updated = e.ts
    state.run ??= e.run
    if (state.status === 'finished') continue // nothing folds after run.finished
    switch (e.type) {
      case 'run.started':
        if (e.subject) state.subject = e.subject
        break
      case 'run.finished':
        state.status = 'finished'
        state.outcome = e.outcome
        if (e.reason !== undefined) state.reason = e.reason
        attentions.length = 0
        for (const t of tasks.values()) {
          const { step: _s, progress: _p, ...rest } = t
          finished.cancelled.push({ ...rest, reason: 'run finished' })
        }
        tasks.clear()
        break
      case 'task.started':
        if (!seen.has(e.task)) {
          seen.add(e.task)
          tasks.set(e.task, {
            task: e.task,
            ...(e.parent !== undefined && { parent: e.parent }),
            subject: e.subject,
          })
        }
        break
      case 'task.finished': {
        const t = tasks.get(e.task)
        if (!t || !(e.outcome in finished)) break
        tasks.delete(e.task)
        const { step: _s, progress: _p, ...rest } = t
        finished[e.outcome].push({ ...rest, ...(e.reason !== undefined && { reason: e.reason }) })
        for (let i = attentions.length - 1; i >= 0; i--)
          if (attentions[i].task === e.task) attentions.splice(i, 1)
        break
      }
      case 'step.started':
      case 'step.finished': {
        const t = tasks.get(e.task)
        if (!t) break
        t.step = e.step
        if (e.type === 'step.finished' && e.links?.length) {
          t.links ??= []
          addLinks(t.links, e.links)
          addLinks(links, e.links)
        }
        break
      }
      case 'progress': {
        const p = { done: e.done, total: e.total, ...(e.label !== undefined && { label: e.label }) }
        if (e.task === undefined) state.progress = p
        else {
          const t = tasks.get(e.task)
          if (t) t.progress = p
        }
        break
      }
      case 'attention': {
        if (attentions.some((a) => a.id === e.id)) break
        attentions.push({
          id: e.id,
          ...(e.task !== undefined && { task: e.task }),
          reason: e.reason,
          needsYou: e.needsYou,
          ...(e.links && { links: e.links }),
        })
        addLinks(links, e.links)
        break
      }
      case 'attention.resolved': {
        const i = attentions.findIndex((a) => a.id === e.id)
        if (i >= 0) attentions.splice(i, 1)
        break
      }
      default:
        break // unknown type or profile type: ignored
    }
  }

  if (
    state.status === 'running' &&
    updated &&
    now.getTime() - Date.parse(updated) > ABANDONED_AFTER_MS
  )
    state.status = 'abandoned'
  state.tasks = [...tasks.values()]
  state.finished = finished
  state.attentions = attentions
  state.needsYou = attentions.some((a) => a.needsYou)
  state.links = links
  state.gaps = gaps
  state.lastSeq = lastSeq
  if (updated) state.updated = updated
  return state
}
