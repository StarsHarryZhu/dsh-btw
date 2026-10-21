# AGENTS.md

## 1. Role

The plugin source. `index.ts` is the host entry that cordis loads in the harness process: it declares the live config and registers the four btw commands. The `host` folder holds the side-question engine it drives, the `client` folder is the browser half bundled into `lib/client.js`, and the `shared` folder is the wire protocol both halves compile in. Nothing here runs inside the main agent's loop.

## 2. Constraints

- The host half (`index.ts`, `host`, `shared`) is type-checked without DOM types; the browser half (`client`, `shared`) without Node types.
- Imports use explicit `.ts` / `.tsx` extensions; the build rewrites them.
- `shared` must stay free of host and browser APIs so both halves can compile it.
- Keep the command names and the answer envelope in `shared/protocol.ts` only.

## 3. Contents

- `index.ts` — host entry: `Config`, `apply`, the four commands, deferred answer publishing, and hiding internal commands from the slash menu.
- `host` — side-question engine: history flattening, prompt, search, model loop, jobs.
- `client` — browser half: cards, turn tail, selection bar, sidebar history, settings page.
- `shared` — command names, limits, and the answer and quote encodings.

## 4. Progress

- Done: both halves implemented and covered by tests.
- Open: nothing blocking; see the root Progress for the one ordering quirk.
- Goal later: an extension point for UI plugin output inside cards.
