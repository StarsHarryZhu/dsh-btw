/**
 * Ask about selected text.
 *
 * Selecting text inside one message row opens a small bar: "Ask" opens a
 * question box and sends `/btw-quote` with the quote and the row's turn, so the
 * answer card is drawn under that reply; "Add to conversation" appends the quote
 * to the composer draft. Only rows the host marks as chat messages qualify;
 * inputs, buttons, and folded process rows keep the browser's behavior.
 * @module dsh-btw/client/selection
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CMD_QUOTE, MAX_QUOTE, encodeQuote } from '../shared/protocol.ts'
import type { RemoteLike, SessionKit } from './host.ts'
import { fallbackT } from './locales.ts'

const ROW = '[data-chat-flow-kind="assistant-step"], [data-chat-flow-kind="assistant"], [data-chat-flow-kind="user"]'
const EXCLUDED = 'input, textarea, button, [contenteditable]:not([contenteditable="false"]), [hidden], [data-turn-process-inline], .dsh-btw-card'

/** A captured selection. */
export interface Captured {
  text: string
  /** Turn of the row the selection sits in, from the host's `data-chat-turn`. */
  turn?: number
  /** Viewport anchor: horizontal center, top, and bottom of the selection. */
  x: number
  top: number
  bottom: number
}

/**
 * Read the current selection if it lies inside one chat message row.
 * @param root - the conversation scroll container, or the document.
 * @returns the selection, or undefined when it does not qualify.
 */
export function captureSelection(root: ParentNode): Captured | undefined {
  const selection = document.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount !== 1) return undefined
  const range = selection.getRangeAt(0)
  const element = (node: Node) => (node.nodeType === 1 ? node as Element : node.parentElement)
  const start = element(range.startContainer)
  const end = element(range.endContainer)
  const row = start?.closest(ROW)
  if (!row || !end || !row.contains(end)) return undefined
  if (root !== document && !(root as Element).contains(row)) return undefined
  if (start?.closest(EXCLUDED) || end.closest(EXCLUDED)) return undefined
  const text = selection.toString()
  if (!text.trim()) return undefined
  const attribute = row.closest('[data-chat-turn]')?.getAttribute('data-chat-turn')
  const turn = attribute !== null && attribute !== undefined && /^\d+$/u.test(attribute) ? Number(attribute) : undefined
  const rect = range.getBoundingClientRect()
  return { text, ...turn === undefined ? {} : { turn }, x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom }
}

/**
 * Append a quote to a draft as a Markdown block quote.
 * @param draft - the composer's current text.
 * @param quote - the selected text.
 * @returns the new draft, the quote followed by an empty line for the cursor.
 */
export function appendQuote(draft: string, quote: string): string {
  const quoted = quote.replace(/\r\n?/gu, '\n').split('\n').map(line => `> ${line}`).join('\n')
  return draft.trim() ? `${draft.replace(/\s+$/u, '')}\n\n${quoted}\n\n` : `${quoted}\n\n`
}

/**
 * Build the per-session selection component.
 * @param getRemote - the live `ctx.remote`.
 * @returns the `conversation.input.dock` entry.
 */
export function createSelectionDock(getRemote: () => RemoteLike | undefined) {
  return function SelectionDock(props: SessionKit): ReactNode {
    const t = props.t ?? fallbackT
    const anchor = useRef<HTMLSpanElement>(null)
    const popover = useRef<HTMLDivElement>(null)
    const [captured, setCaptured] = useState<Captured>()
    const [asking, setAsking] = useState(false)
    const [question, setQuestion] = useState('')
    const [error, setError] = useState<string>()
    const [busy, setBusy] = useState(false)
    const draft = props.useInput?.(state => state?.draft ?? '') ?? ''
    const timeline = props.useChat?.(snapshot => snapshot.timeline)
    const askingRef = useRef(false)
    askingRef.current = asking

    const close = useCallback(() => {
      setCaptured(undefined)
      setAsking(false)
      setQuestion('')
      setError(undefined)
    }, [])

    useEffect(() => {
      const root: ParentNode = anchor.current?.closest('[data-conversation-scroll]') ?? document
      const inside = (target: EventTarget | null) => target instanceof Node && popover.current?.contains(target) === true
      const refresh = (event: Event) => {
        if (inside(event.target) || askingRef.current) return
        setTimeout(() => {
          const next = captureSelection(root)
          setCaptured(next)
          if (next === undefined) setError(undefined)
        }, 0)
      }
      const onKey = (event: globalThis.KeyboardEvent) => {
        if (event.key === 'Escape') close()
        else if (event.shiftKey || event.key === 'Shift') refresh(event)
      }
      const onDown = (event: MouseEvent) => { if (!inside(event.target) && !askingRef.current) setCaptured(undefined) }
      const onScroll = () => { if (!askingRef.current) setCaptured(undefined) }
      document.addEventListener('mouseup', refresh)
      document.addEventListener('keyup', onKey)
      document.addEventListener('mousedown', onDown)
      root.addEventListener('scroll', onScroll, { passive: true } as AddEventListenerOptions)
      return () => {
        document.removeEventListener('mouseup', refresh)
        document.removeEventListener('keyup', onKey)
        document.removeEventListener('mousedown', onDown)
        root.removeEventListener('scroll', onScroll)
      }
    }, [close])

    const send = async (text: string) => {
      const remote = getRemote()
      if (captured === undefined || remote === undefined || props.sessionId === undefined || busy) return
      if (!text.trim()) return
      if (captured.text.length > MAX_QUOTE) {
        setError(t('selection.tooLong', { max: MAX_QUOTE }))
        return
      }
      // Anchor under the reply only once its turn has closed: an open turn has no tail yet.
      const anchorTurn = captured.turn !== undefined && timeline?.turns?.get(captured.turn)?.status === 'closed' ? captured.turn : undefined
      setBusy(true)
      setError(undefined)
      try {
        const line = `/${CMD_QUOTE} ${encodeQuote({ question: text.trim(), quote: captured.text, ...anchorTurn === undefined ? {} : { anchorTurn } })}`
        const response = await remote.commands.execute(props.sessionId, line, [])
        const result = (response.value as { result?: { kind?: string; text?: string } } | undefined)?.result
        if (!response.ok) throw new Error(response.error?.message ?? 'refused')
        if (result?.kind === 'error') throw new Error(result.text ?? 'error')
        document.getSelection()?.removeAllRanges()
        close()
      } catch (failure) {
        setError(t('selection.failed', { detail: failure instanceof Error ? failure.message : String(failure) }))
      } finally {
        setBusy(false)
      }
    }

    const addToConversation = () => {
      if (captured === undefined || props.inputActions?.setDraft === undefined) return
      props.inputActions.setDraft(appendQuote(draft, captured.text))
      props.inputActions.focus?.()
      close()
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        void send(question)
      }
    }

    const keep = (event: { preventDefault(): void }) => event.preventDefault()
    // Keep the centered panel 16px inside the viewport: half its width (bar ~90px, box up to 360px) plus the margin.
    const half = (asking ? Math.min(360, window.innerWidth - 32) / 2 : 90) + 16
    const left = captured === undefined ? 0 : Math.min(Math.max(captured.x, half), window.innerWidth - half)
    const panel = captured === undefined ? null : (
      <div
        ref={popover}
        className="dsh-btw-selection"
        data-mode={asking ? 'ask' : 'bar'}
        style={asking
          ? { left, top: Math.min(captured.bottom + 8, window.innerHeight - 200) }
          : { left, top: Math.max(captured.top - 8, 8) }}
      >
        {asking
          ? (
            <div className="dsh-btw-ask">
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
                <button type="button" className="dsh-btw-button" onClick={close} disabled={busy}>{t('selection.cancel')}</button>
                <button type="button" className="dsh-btw-button" data-primary onClick={() => void send(question)} disabled={busy || !question.trim()}>
                  {busy ? <span className="dsh-btw-spinner" aria-hidden="true" /> : null}
                  {t('selection.send')}
                </button>
              </div>
            </div>
          )
          : (
            <div className="dsh-btw-bar" role="toolbar">
              <button type="button" className="dsh-btw-button" onMouseDown={keep} onClick={() => setAsking(true)}>{t('selection.ask')}</button>
              {props.inputActions?.setDraft !== undefined && (
                <button type="button" className="dsh-btw-button" onMouseDown={keep} onClick={addToConversation}>{t('selection.add')}</button>
              )}
            </div>
          )}
      </div>
    )
    return (
      <>
        <span ref={anchor} hidden data-dsh-btw-selection="" />
        {panel !== null && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
      </>
    )
  }
}
