/**
 * The plugin's settings page on the Plugins screen.
 *
 * Edits the host half's live config (`modelSource`, `provider`, `model`,
 * `reasoningEffort`, `maxSteps`) through the host's settings form for the
 * `dsh-btw` profile entry. The model list comes from the same catalog the
 * model picker uses; a value the catalog does not list is kept and shown as is.
 * @module dsh-btw/client/settings
 */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { CatalogGroup, ConfigFormLike, ConfigViewProps, PathOp, RemoteLike } from './host.ts'
import { fallbackT } from './locales.ts'

/** The edited values. */
interface Values {
  modelSource: 'custom' | 'session'
  provider: string
  model: string
  reasoningEffort: string
  maxSteps: number
}

const DEFAULTS: Values = { modelSource: 'session', provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'low', maxSteps: 4 }

/**
 * Read form values with defaults.
 * @param value - the form's accepted section.
 * @returns complete values.
 */
export function readValues(value: Record<string, unknown> | undefined): Values {
  const pick = <K extends keyof Values>(key: K, check: (item: unknown) => boolean): Values[K] =>
    (value !== undefined && check(value[key]) ? value[key] : DEFAULTS[key]) as Values[K]
  return {
    modelSource: pick('modelSource', item => item === 'custom' || item === 'session'),
    provider: pick('provider', item => typeof item === 'string' && item.length > 0),
    model: pick('model', item => typeof item === 'string' && item.length > 0),
    reasoningEffort: pick('reasoningEffort', item => typeof item === 'string'),
    maxSteps: pick('maxSteps', item => typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= 8),
  }
}

/**
 * Build the settings component over the form and the catalog.
 * @param form - the `dsh-btw` settings form.
 * @param getRemote - the live `ctx.remote`, for the model catalog.
 * @returns the `plugins.bundle.config` entry.
 */
export function createSettings(form: ConfigFormLike, getRemote: () => RemoteLike | undefined) {
  // The host form is a class instance: keep its methods bound.
  const subscribe = (listener: () => void) => form.subscribe(listener)
  const getSnapshot = () => form.getSnapshot()
  return function BtwSettings(props: ConfigViewProps): ReactNode {
    const t = props.t ?? fallbackT
    const snapshot = useSyncExternalStore(subscribe, getSnapshot)
    const stored = readValues(snapshot.value)
    if (props.view === 'summary') {
      return stored.modelSource === 'session'
        ? t('settings.summary.session')
        : t('settings.summary.custom', { model: stored.model, effort: stored.reasoningEffort ? ` · ${stored.reasoningEffort}` : '' })
    }
    return <SettingsPage form={form} stored={stored} ready={snapshot.status === 'ready'} writable={snapshot.writable !== false}
      revision={snapshot.revision} getRemote={getRemote} t={t} />
  }
}

function SettingsPage(props: {
  form: ConfigFormLike
  stored: Values
  ready: boolean
  writable: boolean
  revision: number | undefined
  getRemote: () => RemoteLike | undefined
  t: (key: string, params?: Record<string, unknown>) => string
}): ReactNode {
  const { t, stored } = props
  const [draft, setDraft] = useState<Values>(stored)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [groups, setGroups] = useState<readonly CatalogGroup[]>()
  const [catalogFailed, setCatalogFailed] = useState(false)
  const storedKey = JSON.stringify(stored)
  // Re-seed the draft only when the stored values change, not on every render.
  useEffect(() => { setDraft(stored) }, [storedKey])

  useEffect(() => {
    let live = true
    const catalog = props.getRemote()?.session?.modelCatalog()
    if (catalog === undefined) {
      setCatalogFailed(true)
      return
    }
    catalog.then((response) => {
      if (!live) return
      if (response.ok && response.value) setGroups(response.value.groups)
      else setCatalogFailed(true)
    }, () => { if (live) setCatalogFailed(true) })
    return () => { live = false }
  }, [props.getRemote])

  if (!props.ready) return <p className="dsh-btw-settings-note">{t('settings.loading')}</p>
  const routeKey = `${draft.provider}\u0000${draft.model}`
  const models = (groups ?? []).flatMap(group => group.models.map(model => ({ group, model })))
  const current = models.find(item => item.group.id === draft.provider && item.model.id === draft.model)
  const efforts = current?.model.reasoning?.efforts ?? []
  const dirty = JSON.stringify(draft) !== storedKey
  const disabled = !props.writable || status === 'saving'
  const save = async () => {
    setStatus('saving')
    const ops: PathOp[] = (Object.keys(draft) as (keyof Values)[])
      .filter(key => draft[key] !== stored[key])
      .map(key => ({ op: 'set', path: [key], value: draft[key] }))
    try {
      setStatus(await props.form.mutate(ops, props.revision) ? 'saved' : 'failed')
    } catch {
      setStatus('failed')
    }
  }
  const update = (patch: Partial<Values>) => {
    setDraft(value => ({ ...value, ...patch }))
    setStatus('idle')
  }
  return (
    <div className="dsh-btw-settings">
      <fieldset disabled={disabled}>
        <legend>{t('settings.source')}</legend>
        {(['session', 'custom'] as const).map(source => (
          <label key={source} className="dsh-btw-radio">
            <input type="radio" name="dsh-btw-source" checked={draft.modelSource === source} onChange={() => update({ modelSource: source })} />
            {t(`settings.source.${source}`)}
          </label>
        ))}
      </fieldset>
      {draft.modelSource === 'custom' && (
        <>
          <label className="dsh-btw-field">
            <span>{t('settings.model')}</span>
            <select value={routeKey} disabled={disabled} onChange={(event) => {
              const [provider = '', model = ''] = event.target.value.split('\u0000')
              const picked = models.find(item => item.group.id === provider && item.model.id === model)
              const supported = picked?.model.reasoning?.efforts?.some(effort => effort.id === draft.reasoningEffort) ?? false
              update({ provider, model, reasoningEffort: supported ? draft.reasoningEffort : picked?.model.reasoning?.defaultEffort ?? '' })
            }}>
              {current === undefined && <option value={routeKey}>{`${draft.provider} / ${draft.model}`}</option>}
              {(groups ?? []).map(group => (
                <optgroup key={group.id} label={group.name ?? group.id}>
                  {group.models.map(model => (
                    <option key={model.id} value={`${group.id}\u0000${model.id}`}>{model.name ?? model.id}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="dsh-btw-field">
            <span>{t('settings.effort')}</span>
            <select value={draft.reasoningEffort} disabled={disabled} onChange={event => update({ reasoningEffort: event.target.value })}>
              <option value="">{t('settings.effort.default')}</option>
              {efforts.map(effort => <option key={effort.id} value={effort.id}>{effort.name ?? effort.id}</option>)}
              {draft.reasoningEffort && !efforts.some(effort => effort.id === draft.reasoningEffort) && (
                <option value={draft.reasoningEffort}>{draft.reasoningEffort}</option>
              )}
            </select>
          </label>
        </>
      )}
      <label className="dsh-btw-field">
        <span>{t('settings.steps')}</span>
        <input type="number" min={1} max={8} value={draft.maxSteps} disabled={disabled}
          onChange={event => update({ maxSteps: Math.min(8, Math.max(1, Math.round(Number(event.target.value) || 1))) })} />
      </label>
      {catalogFailed && <p className="dsh-btw-settings-note">{t('settings.catalogFailed')}</p>}
      {!props.writable && <p className="dsh-btw-settings-note">{t('settings.readonly')}</p>}
      <div className="dsh-btw-settings-actions">
        <button type="button" className="dsh-btw-button" data-primary disabled={disabled || !dirty} onClick={() => void save()}>
          {t('settings.save')}
        </button>
        {status === 'saved' && <span className="dsh-btw-settings-note">{t('settings.saved')}</span>}
        {status === 'failed' && <span className="dsh-btw-error">{t('settings.failed')}</span>}
      </div>
    </div>
  )
}
