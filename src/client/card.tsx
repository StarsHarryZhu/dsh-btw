/**
 * One side question card.
 *
 * Pending: the title row with a spinner and nothing else from the model — no
 * reasoning is ever shown. Settled: the title the model wrote, the question,
 * the Markdown answer (the host's renderer, with formulas), and its sources.
 * Collapsed: the title row alone.
 * @module dsh-btw/client/card
 */

import { useState, type ComponentType, type ReactNode } from 'react'
import { fallbackTitle } from '../shared/protocol.ts'
import type { Translate } from './host.ts'
import { useCollapsed } from './prefs.ts'
import { isStale, type BtwRecord } from './records.ts'

declare const require: (id: string) => unknown

/** Props of the host's `MarkdownText`. */
interface MarkdownProps {
  text: string
  labels: { code: { copyLabel: string; copiedLabel: string }; footnotes: string }
  variant?: 'body' | 'compact'
}

let markdown: ComponentType<MarkdownProps> | null | undefined

/** The host Markdown renderer, or null when this host does not share one. */
function hostMarkdown(): ComponentType<MarkdownProps> | null {
  if (markdown !== undefined) return markdown
  try {
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives') as { MarkdownText?: ComponentType<MarkdownProps> }
    markdown = primitives.MarkdownText ?? null
  } catch {
    markdown = null
  }
  return markdown
}

export interface CardProps {
  record: BtwRecord
  t: Translate
  onDelete: (id: string) => void
  /** Shown under the header when a deletion failed. */
  notice?: string | undefined
  /** `inline` in the conversation; `panel` in the sidebar, which owns its own open state. */
  variant?: 'inline' | 'panel'
  /** Panel-owned open state; the inline card remembers collapse per browser. */
  open?: [boolean, () => void]
  /** Extra header controls before copy and delete. */
  actions?: ReactNode
  /** Small text after the title, such as the time. */
  meta?: ReactNode
}

/**
 * Render one card.
 * @param props - the record, copy, and actions.
 * @returns the card.
 */
export function BtwCard(props: CardProps): ReactNode {
  const { record, t } = props
  const [collapsedPref, togglePref] = useCollapsed(record.id)
  const [expanded, toggle] = props.open ?? [!collapsedPref, togglePref]
  const [copied, setCopied] = useState(false)
  const stale = isStale(record)
  const pending = record.status === 'pending' && !stale
  const title = record.answer?.title || fallbackTitle(record.question)
  const error = record.error ?? record.answer?.error ?? (stale ? t('card.stale') : undefined)
  const answer = record.answer?.answer ?? ''
  const sources = record.answer?.sources ?? []
  const copy = () => {
    void navigator.clipboard?.writeText(answer).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }, () => undefined)
  }
  return (
    <section
      className="dsh-btw-card"
      data-dsh-btw-id={record.id}
      data-variant={props.variant ?? 'inline'}
      data-state={pending ? 'pending' : error ? 'error' : 'done'}
      aria-label={`${t('card.label')}: ${title}`}
    >
      <header className="dsh-btw-head">
        <button type="button" className="dsh-btw-toggle" aria-expanded={expanded} onClick={toggle}
          title={expanded ? t('card.collapse') : t('card.expand')}>
          <ChevronIcon open={expanded} />
          <span className="dsh-btw-badge">{t('card.label')}</span>
          <span className="dsh-btw-title">{title}</span>
          {props.meta !== undefined && <span className="dsh-btw-meta">{props.meta}</span>}
        </button>
        {pending && !expanded && <span className="dsh-btw-spinner" role="status" aria-label={t('card.answering')} />}
        <span className="dsh-btw-actions">
          {props.actions}
          {answer && (
            <button type="button" className="dsh-btw-icon" onClick={copy} title={copied ? t('card.copied') : t('card.copy')}
              aria-label={copied ? t('card.copied') : t('card.copy')}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          )}
          <button type="button" className="dsh-btw-icon" onClick={() => props.onDelete(record.id)}
            title={pending ? t('card.stop') : t('card.delete')} aria-label={pending ? t('card.stop') : t('card.delete')}>
            <CloseIcon />
          </button>
        </span>
      </header>
      {props.notice !== undefined && <p className="dsh-btw-error" role="alert">{props.notice}</p>}
      {expanded && (
        <div className="dsh-btw-body">
          <p className="dsh-btw-question"><span className="dsh-btw-q">{t('card.question')}</span>{record.question}</p>
          {record.quote !== undefined && (
            <details className="dsh-btw-quote">
              <summary>{t('card.quote')}</summary>
              <blockquote>{record.quote}</blockquote>
            </details>
          )}
          {pending && (
            <p className="dsh-btw-status" role="status">
              <span className="dsh-btw-spinner" aria-hidden="true" />
              {t('card.answering')}
            </p>
          )}
          {error !== undefined && <p className="dsh-btw-error" role="alert">{error}</p>}
          {answer && <AnswerText text={answer} t={t} />}
          {sources.length > 0 && (
            <div className="dsh-btw-sources">
              <span>{t('card.sources')}</span>
              <ol>
                {sources.map(source => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title || source.url}</a>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {record.answer?.model !== undefined && <p className="dsh-btw-model">{record.answer.model}</p>}
        </div>
      )}
    </section>
  )
}

function AnswerText({ text, t }: { text: string; t: Translate }): ReactNode {
  const Markdown = hostMarkdown()
  if (Markdown === null) return <div className="dsh-btw-answer dsh-btw-plain">{text}</div>
  return (
    <div className="dsh-btw-answer">
      <Markdown
        text={text}
        variant="compact"
        labels={{ code: { copyLabel: t('card.copyCode'), copiedLabel: t('card.copiedCode') }, footnotes: t('card.footnotes') }}
      />
    </div>
  )
}

const ICON = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

function ChevronIcon({ open }: { open: boolean }): ReactNode {
  return <svg {...ICON} className="dsh-btw-chevron" data-open={open || undefined}><path d="M6 4l4 4-4 4" /></svg>
}

function CopyIcon(): ReactNode {
  return <svg {...ICON}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></svg>
}

function CheckIcon(): ReactNode {
  return <svg {...ICON}><path d="M3.5 8.5l3 3 6-7" /></svg>
}

function CloseIcon(): ReactNode {
  return <svg {...ICON}><path d="M4 4l8 8M12 4l-8 8" /></svg>
}

/** Crosshair glyph for the sidebar's locate control. */
export function LocateIcon(): ReactNode {
  return <svg {...ICON}><circle cx="8" cy="8" r="4.5" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" /></svg>
}
