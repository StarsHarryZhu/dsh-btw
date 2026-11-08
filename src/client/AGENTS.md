# AGENTS.md

## 1. Role

The browser half, bundled into `lib/client.js`. It draws every side question from the session's command records: cards at their command's place in the conversation, cards under the reply a selection quoted, "Ask" beside the host's "Quote text" when text is selected, a right-sidebar history tab, and the plugin's settings page on the Plugins screen. It also sends the `/btw-quote` and `/btw-delete` commands.

## 2. Constraints

- Import no harness package, not even for types; host props and services are structural in `host.ts`, and every field is optional.
- Only `react`, `react/jsx-runtime`, `react-dom`, and `@deepseek-ai/dsh-client-ui-primitives` may be required from outside the bundle; the primitives are optional at runtime.
- All views derive from `records.ts` over the Chat snapshot; no view keeps its own copy of the records.
- Never show reasoning; a pending card shows only its spinner and the question.
- Selection actions live only in the host `conversation.chat.text-interaction` surface: shadow the host `quote` key at a negative priority so "Quote text" and "Ask" share one pill, and register the `dsh-btw` interaction and key for when Quote is absent. Never add a second selection popover or listen to selections directly. "Quote text" must do exactly what the host button does (`inputActions.insertQuote`); nothing else edits the composer.
- Colors come from host theme tokens (`--dsw-alias-*`) only.
- A failing contribution is logged and skipped, never thrown from `apply`.
- Each `ctx.remote` namespace is its own service: read `remote.commands` only inside `ctx.inject(['remote', 'remote.commands'])` and `remote.session` inside `ctx.inject(['remote', 'remote.session'])`; reading one without its inject throws synchronously.

## 3. Contents

- `index.ts` — `apply`: registers command rows, turn tail, selection surfaces and interaction, history tab, settings page, copy, and stylesheet.
- `host.ts` — structural types of the slot props and services used.
- `records.ts` — fold command nodes into side-question records; anchoring and staleness.
- `card.tsx` — the card: header, collapse, copy, delete, answer, sources.
- `views.tsx` — command row, turn tail, and history tab components, and deletion.
- `selection.tsx` — the "Quote text" / "Ask" pill and the question box inside the host selection surface.
- `settings.tsx` — the settings page over the `dsh-btw` settings form and the model catalog.
- `prefs.ts` — per-browser collapse state and in-flight deletions.
- `locales.ts` — Chinese and English copy.
- `styles.css` — the stylesheet, inlined by the build.
- `css.d.ts` — the type of the inlined stylesheet module.

## 4. Progress

- Done: all views implemented; `tests/client.test.tsx` drives the built bundle.
- Verified in the real app: command rows, turn tail, selection surface, sidebar tab, and settings page all receive the props and services they expect. The selection pill replaces the host Quote button in place; "Quote text" inserts the composer quote; "Ask" turns the surface into the question box, which the host keeps inside the column; the answer card lands under the selected reply.
- Done: the selection surface is covered by a jsdom spec through the built bundle.
- Goal later: render UI plugin factories inside cards.
