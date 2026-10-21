/**
 * dsh-btw browser half.
 *
 * Contributes, all under this plugin's names: the command rows of the four btw
 * commands, one turn-tail entry for cards that quote a reply, one composer-dock
 * entry for asking about selected text, a right-sidebar history tab, a settings
 * page, the copy, and one stylesheet. Each is an effect of this plugin's
 * context and is skipped (logged) if its host seat is missing.
 * @module dsh-btw/client
 */

import { CMD_ANSWER, CMD_ASK, CMD_DELETE, CMD_QUOTE, LOCALE_NS, PLUGIN_ID } from '../shared/protocol.ts'
import type { ClientContextLike, ConfigFormsLike, LocaleLike, RemoteLike, SidebarTabsLike, SlotsLike, Translate } from './host.ts'
import { en, fallbackT, zh } from './locales.ts'
import { createSelectionDock } from './selection.tsx'
import { createSettings } from './settings.tsx'
import css from './styles.css'
import { Nothing, createViews } from './views.tsx'

export const name = PLUGIN_ID
export const inject = ['slots', 'locale']

/** Right-sidebar tab type identity and kind. */
export const HISTORY_TAB_ID = 'dsh-btw/history'
const HISTORY_TAB_KIND = 'dsh-btw-history'

/**
 * Register the browser contributions.
 * @param ctx - the plugin's client context.
 */
export function apply(ctx: ClientContextLike): void {
  const slots = ctx.get?.('slots') as SlotsLike | undefined
  const locale = ctx.get?.('locale') as LocaleLike | undefined
  if (slots === undefined) {
    console.error(`${PLUGIN_ID}: the slots service is missing, so no card can render`)
    return
  }
  // Each remote namespace is its own service and must be injected before use.
  let commands: RemoteLike['commands'] | undefined
  let session: RemoteLike['session'] | undefined
  const getRemote = (): RemoteLike | undefined => (commands === undefined ? undefined : { commands, ...session === undefined ? {} : { session } })
  const bound = locale?.bind?.(LOCALE_NS)
  const t: Translate = bound ?? fallbackT
  const { CommandRow, Tail, HistoryTab } = createViews(getRemote)
  const SelectionDock = createSelectionDock(getRemote)

  guard('dictionaries', () => {
    if (locale !== undefined) ctx.effect?.(() => locale.register(LOCALE_NS, { zh, en }), `${PLUGIN_ID}: dictionaries`)
  })
  guard('styles', () => {
    ctx.effect?.(() => mountStyles(css), `${PLUGIN_ID}: styles`)
  })
  guard('remote', () => {
    ctx.inject?.(['remote', 'remote.commands'], (scope) => {
      const service = (scope.get?.('remote') as RemoteLike | undefined)?.commands
      commands = service
      scope.effect?.(() => () => { if (commands === service) commands = undefined }, `${PLUGIN_ID}: remote commands`)
    })
    ctx.inject?.(['remote', 'remote.session'], (scope) => {
      const service = (scope.get?.('remote') as RemoteLike | undefined)?.session
      session = service
      scope.effect?.(() => () => { if (session === service) session = undefined }, `${PLUGIN_ID}: remote session`)
    })
  })
  guard('command rows', () => {
    slots.inject('conversation.chat.commandview', () => {
      const off = [
        slots.register({ name: 'conversation.chat.commandview', key: CMD_ASK, locale: LOCALE_NS }, CommandRow),
        slots.register({ name: 'conversation.chat.commandview', key: CMD_QUOTE, locale: LOCALE_NS }, CommandRow),
        slots.register({ name: 'conversation.chat.commandview', key: CMD_ANSWER }, Nothing),
        slots.register({ name: 'conversation.chat.commandview', key: CMD_DELETE }, Nothing),
      ]
      return () => { for (const dispose of off) dispose() }
    })
  })
  guard('turn tail', () => {
    slots.inject('conversation.chat.turnTail', () => slots.register(
      { name: 'conversation.chat.turnTail', id: PLUGIN_ID, order: 30, locale: LOCALE_NS },
      Tail,
    ))
  })
  guard('selection', () => {
    slots.inject('conversation.input.dock', () => slots.register(
      { name: 'conversation.input.dock', id: PLUGIN_ID, order: -40, locale: LOCALE_NS },
      SelectionDock,
    ))
  })
  guard('history tab', () => {
    ctx.inject?.(['sidebarRightTabs'], (scope) => {
      const tabs = scope.get?.('sidebarRightTabs') as SidebarTabsLike | undefined
      const scopedSlots = (scope.get?.('slots') as SlotsLike | undefined) ?? slots
      if (tabs === undefined) return
      scope.effect?.(() => tabs.register({
        id: HISTORY_TAB_ID,
        kind: HISTORY_TAB_KIND,
        title: () => t('tab.title'),
        guide: [{ id: 'history', order: 60, title: () => t('tab.guide'), description: () => t('tab.guideDescription') }],
      }), `${PLUGIN_ID}: history tab type`)
      scopedSlots.inject('sidebar.right.pane.tab', () => scopedSlots.register(
        { name: 'sidebar.right.pane.tab', key: HISTORY_TAB_ID, locale: LOCALE_NS },
        HistoryTab,
      ))
    })
  })
  guard('settings', () => {
    ctx.inject?.(['configForms'], (scope) => {
      const forms = scope.get?.('configForms') as ConfigFormsLike | undefined
      const scopedSlots = (scope.get?.('slots') as SlotsLike | undefined) ?? slots
      if (forms === undefined) return
      const Settings = createSettings(forms.get(PLUGIN_ID), getRemote)
      scopedSlots.inject('plugins.bundle.config', () => scopedSlots.register(
        { name: 'plugins.bundle.config', key: PLUGIN_ID, locale: LOCALE_NS },
        Settings,
      ))
    })
  })
}

/** Run one contribution, logging instead of throwing: a throw here fails the page's boot. */
function guard(label: string, run: () => void): void {
  try {
    run()
  } catch (error) {
    console.error(`${PLUGIN_ID}: the ${label} could not be registered`, error)
  }
}

/**
 * Add the plugin's stylesheet, tagged with the plugin id.
 * @param text - the stylesheet.
 * @returns the cleanup that removes it.
 */
function mountStyles(text: string): () => void {
  if (typeof document === 'undefined') return () => undefined
  const style = document.createElement('style')
  style.setAttribute('data-plugin', PLUGIN_ID)
  style.setAttribute('data-plugin-css', `${PLUGIN_ID}/styles.css`)
  style.textContent = text
  document.head.appendChild(style)
  return () => { style.remove() }
}
