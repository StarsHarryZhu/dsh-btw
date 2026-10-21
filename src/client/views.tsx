/**
 * Where cards appear.
 *
 * - `/btw` cards sit at their command's place in the conversation.
 * - Cards asked from a selection sit under the reply they quote (the turn
 *   tail); before that turn has closed they stay at their command's place.
 * - The right sidebar's history tab lists every live card of the session.
 * All three read the same records, so a deletion anywhere hides it everywhere.
 * @module dsh-btw/client/views
 */

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { CMD_ASK, CMD_DELETE, CMD_QUOTE, parseQuote } from '../shared/protocol.ts'
import { BtwCard, LocateIcon } from './card.tsx'
import type { CommandNodeLike, CommandRowProps, RemoteLike, SessionKit, TurnTailProps, UseChat } from './host.ts'
import { fallbackT } from './locales.ts'
import { IdSet, deleting, useDeleting } from './prefs.ts'
import { anchoredTo, deriveRecords, nodesOf, sameList, type BtwRecord, type BtwRecords } from './records.ts'

const NONE: readonly BtwRecord[] = []

/** Deletions the host refused; the card shows a notice until retried. */
const failedDeletes = new IdSet()

function useRecords(useChat: UseChat | undefined): BtwRecords | undefined {
  return useChat?.(snapshot => deriveRecords(nodesOf(snapshot)))
}

/**
 * Build the view components over the remote service.
 * @param getRemote - the live `ctx.remote`, absent until it is injected.
 * @returns the command row, turn tail, and history tab components.
 */
export function createViews(getRemote: () => RemoteLike | undefined) {
  const remove = (sessionId: string | undefined, id: string): void => {
    const remote = getRemote()
    if (sessionId === undefined || remote === undefined) {
      failedDeletes.set(id, true)
      return
    }
    deleting.set(id, true)
    failedDeletes.set(id, false)
    // An async function, so a synchronous throw from the transport also restores the card.
    const send = async () => {
      const result = await remote.commands.execute(sessionId, `/${CMD_DELETE} ${id}`, [])
      if (!result.ok) throw new Error(result.error?.message ?? 'delete refused')
    }
    send().catch((error: unknown) => {
      console.warn('dsh-btw: delete failed', error)
      deleting.set(id, false)
      failedDeletes.set(id, true)
    })
  }

  function Card(props: { record: BtwRecord; kit: SessionKit; variant?: 'inline' | 'panel'; open?: [boolean, () => void]; actions?: ReactNode; meta?: ReactNode }): ReactNode {
    const t = props.kit.t ?? fallbackT
    const failed = useSyncExternalStore(failedDeletes.subscribe, failedDeletes.snapshot).has(props.record.id)
    return (
      <BtwCard
        record={props.record}
        t={t}
        onDelete={id => remove(props.kit.sessionId, id)}
        notice={failed ? t('card.deleteFailed') : undefined}
        variant={props.variant ?? 'inline'}
        {...props.open === undefined ? {} : { open: props.open }}
        actions={props.actions}
        meta={props.meta}
      />
    )
  }

  /** `conversation.chat.commandview` entry for every btw command name. */
  function CommandRow(props: CommandRowProps): ReactNode {
    const node = props.node
    const records = useRecords(props.useChat)
    const anchor = node?.name === CMD_QUOTE ? parseQuote(node.args)?.anchorTurn : undefined
    const anchorClosed = props.useChat?.(snapshot => anchor !== undefined && snapshot.timeline?.turns?.get(anchor)?.status === 'closed') ?? false
    const hidden = useDeleting()
    if (node === undefined || (node.name !== CMD_ASK && node.name !== CMD_QUOTE) || typeof node.commandId !== 'string') return null
    // Without the Chat snapshot (an older host) the card is built from its own
    // node; it then cannot see its answer or deletion, but still shows the question.
    const record = records === undefined ? recordFromNode(node) : records.byId.get(node.commandId)
    if (record === undefined || hidden.has(record.id)) return null
    if (anchorClosed) return null
    return <Card record={record} kit={props} />
  }

  /** `conversation.chat.turnTail` entry: cards that quote this turn's reply. */
  function Tail(props: TurnTailProps): ReactNode {
    const turn = props.turn?.turn
    const anchored = props.useChat?.(
      snapshot => (turn === undefined ? NONE : anchoredTo(deriveRecords(nodesOf(snapshot)), turn)),
      sameList,
    ) ?? NONE
    const hidden = useDeleting()
    const visible = anchored.filter(record => !hidden.has(record.id))
    if (visible.length === 0) return null
    return <div className="dsh-btw-tail">{visible.map(record => <Card key={record.id} record={record} kit={props} />)}</div>
  }

  /** `sidebar.right.pane.tab` body: the session's side questions, newest first. */
  function HistoryTab(props: SessionKit): ReactNode {
    const t = props.t ?? fallbackT
    const records = useRecords(props.useChat)
    const hidden = useDeleting()
    const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
    const [missing, setMissing] = useState<string>()
    const items = (records?.list ?? NONE).filter(record => !hidden.has(record.id)).slice().reverse()
    if (items.length === 0) return <div className="dsh-btw-history"><p className="dsh-btw-empty">{t('tab.empty')}</p></div>
    const toggle = (id: string) => setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    const locate = (id: string) => {
      const target = [...document.querySelectorAll('[data-dsh-btw-id][data-variant="inline"]')]
        .find(element => element.getAttribute('data-dsh-btw-id') === id)
      if (target === undefined) {
        setMissing(id)
        return
      }
      setMissing(undefined)
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target.setAttribute('data-flash', '')
      setTimeout(() => target.removeAttribute('data-flash'), 1600)
    }
    return (
      <div className="dsh-btw-history">
        {items.map(record => (
          <div key={record.id} className="dsh-btw-history-item">
            <Card
              record={record}
              kit={props}
              variant="panel"
              open={[open.has(record.id), () => toggle(record.id)]}
              meta={<>{record.kind === 'quote' && <span className="dsh-btw-tag">{t('tab.quoted')}</span>}{formatTime(record.time)}</>}
              actions={(
                <button type="button" className="dsh-btw-icon" onClick={() => locate(record.id)}
                  title={t('tab.locate')} aria-label={t('tab.locate')}>
                  <LocateIcon />
                </button>
              )}
            />
            {missing === record.id && <p className="dsh-btw-hint">{t('tab.notLoaded')}</p>}
          </div>
        ))}
      </div>
    )
  }

  return { CommandRow, Tail, HistoryTab }
}

/** A record built from one command node alone. */
function recordFromNode(node: CommandNodeLike): BtwRecord | undefined {
  const records = deriveRecords([node])
  return records.list[0]
}

function formatTime(time: number): string {
  if (!time) return ''
  const date = new Date(time)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Render nothing: the row of a command that has no card of its own. */
export function Nothing(): ReactNode {
  return null
}

