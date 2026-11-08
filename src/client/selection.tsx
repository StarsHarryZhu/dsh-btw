/**
 * Ask about selected text, inside the host's selection surface.
 *
 * The host Chat elects one text-interaction surface per selection, and its
 * built-in Quote plugin owns that surface under the `quote` key with a single
 * "Quote text" button. This module shadows the `quote` key (the lowest slot
 * priority renders) with one pill holding both actions: "Quote text", which
 * does what the host button does (`inputActions.insertQuote`), and "Ask",
 * which turns the same surface into a question box and sends `/btw-quote` with
 * the quote and the reply's turn, so the answer card is drawn under that
 * reply. The same component also answers this plugin's own interaction, which
 * the host elects only when Quote is absent or declines; then only "Ask" shows.
 * The host decides which text qualifies, places the surface, and dismisses it.
 * @module dsh-btw/client/selection
 */

import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CMD_QUOTE, MAX_QUOTE, encodeQuote } from '../shared/protocol.ts'
import type { InteractionRequestLike, RemoteLike, SelectionProps, SessionSnapshotLike } from './host.ts'
import { fallbackT } from './locales.ts'

/** The host Quote plugin's surface key, shadowed by this plugin. */
export const QUOTE_SURFACE = 'quote'
/** Slot priority that renders ahead of the host Quote entry (priority 0). */
export const QUOTE_SURFACE_PRIORITY = -10

/** The quote and its reply turn, captured when "Ask" is chosen. */
interface Captured {
  text: string
  turn?: number
}

/**
 * This plugin's own interaction: open on any text selection the host offers.
 * @param request - the host gesture.
 */
export function onInteraction(request: InteractionRequestLike): void {
  if (request.trigger === 'selection' && request.readText() !== null) request.open()
}

/** The Quote plugin's rule: quoting writes into the composer, so the session must accept prompts. */
function writable(session: SessionSnapshotLike): boolean {
  return session.removed !== true && (session.subagent === null || session.subagent === undefined
    || (session.subagent.address?.mode === 'continuable' && session.subagent.parentAvailable === true))
}

/**
 * Read the turn of the reply holding the live selection, from the host's `data-chat-turn`.
 * @returns the turn, or undefined when the selection is gone or outside a turn.
 */
function selectionTurn(): number | undefined {
  const selection = typeof document === 'undefined' ? null : document.getSelection()
  if (selection === null || selection.rangeCount === 0) return undefined
  const node = selection.getRangeAt(0).startContainer
  const element = node.nodeType === 1 ? node as Element : node.parentElement
  const attribute = element?.closest('[data-chat-turn]')?.getAttribute('data-chat-turn')
  return attribute !== null && attribute !== undefined && /^\d+$/u.test(attribute) ? Number(attribute) : undefined
}

/**
 * Build the selection surface component.
 * @param getRemote - the live `ctx.remote`.
 * @returns the `conversation.chat.text-interaction` entry.
 */
export function createSelectionActions(getRemote: () => RemoteLike | undefined) {
  return function SelectionActions(props: SelectionProps): ReactNode {
    const t = props.t ?? fallbackT
    const dismiss = props.dismiss ?? (() => undefined)
    const live = props.useSession?.(session => session.removed !== true) ?? true
    const canQuote = (props.useSession?.(writable) ?? true) && props.inputActions !== undefined
    const timeline = props.useChat?.(snapshot => snapshot.timeline)
    const [asking, setAsking] = useState<Captured>()
    const [question, setQuestion] = useState('')
    const [error, setError] = useState<string>()
    const [busy, setBusy] = useState(false)

    useEffect(() => {
      if (!live) dismiss()
    }, [live, dismiss])
    if (!live) return null

    // Keep the page selection while a button is pressed, as the host Quote button does.
    const keep = (event: { preventDefault(): void }) => event.preventDefault()

    const quote = () => {
      const text = props.readText?.() ?? null
      if (text === null) { dismiss(); return }
      if (props.inputActions?.insertQuote(text) !== true) return
      props.clearSelection?.()
      dismiss()
    }

    const ask = () => {
      const text = props.readText?.() ?? null
      if (text === null) { dismiss(); return }
      const turn = selectionTurn()
      setAsking({ text, ...turn === undefined ? {} : { turn } })
      setError(text.length > MAX_QUOTE ? t('selection.tooLong', { max: MAX_QUOTE }) : undefined)
    }

    const send = async (text: string) => {
      if (asking === undefined || busy || !text.trim()) return
      if (asking.text.length > MAX_QUOTE) {
        setError(t('selection.tooLong', { max: MAX_QUOTE }))
        return
      }
      const remote = getRemote()
      if (remote === undefined || props.sessionId === undefined) {
        setError(t('selection.failed', { detail: t('selection.offline') }))
        return
      }
      // Anchor under the reply only once its turn has closed: an open turn has no tail yet.
      const anchorTurn = asking.turn !== undefined && timeline?.turns?.get(asking.turn)?.status === 'closed' ? asking.turn : undefined
      setBusy(true)
      setError(undefined)
      try {
        const line = `/${CMD_QUOTE} ${encodeQuote({ question: text.trim(), quote: asking.text, ...anchorTurn === undefined ? {} : { anchorTurn } })}`
        const response = await remote.commands.execute(props.sessionId, line, [])
        const result = (response.value as { result?: { kind?: string; text?: string } } | undefined)?.result
        if (!response.ok) throw new Error(response.error?.message ?? 'refused')
        if (result?.kind === 'error') throw new Error(result.text ?? 'error')
        props.clearSelection?.()
        dismiss()
      } catch (failure) {
        setError(t('selection.failed', { detail: failure instanceof Error ? failure.message : String(failure) }))
      } finally {
        setBusy(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
      } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        void send(question)
      }
    }

    if (asking !== undefined) {
      return (
        <div className="dsh-btw-ask" data-dsh-btw-selection="ask">
          <textarea
            autoFocus
            rows={2}
            value={question}
            placeholder={t('selection.placeholder')}
            onChange={event => setQuestion(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
          />
          {error !== undefined && <p className="dsh-btw-error" role="alert">{error}</p>}
          <div className="dsh-btw-ask-actions">
            <button type="button" className="dsh-btw-button" onClick={() => void send(t('selection.explainQuestion'))} disabled={busy}>
              {t('selection.explain')}
            </button>
            <span className="dsh-btw-spacer" />
            <button type="button" className="dsh-btw-button" onClick={dismiss} disabled={busy}>{t('selection.cancel')}</button>
            <button type="button" className="dsh-btw-button" data-primary onClick={() => void send(question)} disabled={busy || !question.trim()}>
              {busy ? <span className="dsh-btw-spinner" aria-hidden="true" /> : null}
              {t('selection.send')}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="dsh-btw-pick" role="toolbar" data-dsh-btw-selection="bar">
        {canQuote && (
          <>
            <button type="button" onPointerDown={keep} onMouseDown={keep} onClick={quote}>{t('selection.quote')}</button>
            <span className="dsh-btw-pick-divider" aria-hidden="true" />
          </>
        )}
        <button type="button" onPointerDown={keep} onMouseDown={keep} onClick={ask}>{t('selection.ask')}</button>
      </div>
    )
  }
}
