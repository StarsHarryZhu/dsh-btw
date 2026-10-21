# AGENTS.md

## 1. Role

The plugin's display metadata for the host's Plugins page. The installed-plugins list shows `meta.title` and `meta.description` from the file matching the interface language instead of the bare package name. The in-app copy of cards, sidebar, selection bar, and settings lives in the browser half, not here.

## 2. Constraints

- Keep exactly the `meta.title` and `meta.description` keys, in both languages.
- `meta.title` is the package name, `dsh-btw`, in both languages.
- Keep the two files saying the same thing.

## 3. Contents

- `zh.json` — Chinese title and description.
- `en.json` — English title and description.

## 4. Progress

- Done: both languages.
- Open: nothing.
- Goal later: nothing planned.
