# AGENTS.md

## 1. Role

Development helpers that are not part of the published plugin. The plugin ships no runtime dependency, so its compiler, test runner, React, cordis, and schemastery are borrowed from the sibling DeepSeek Harness checkout by symlinking them into this package's own `node_modules`, which keeps their versions identical to the host that loads the plugin.

## 2. Constraints

- Write nothing outside this package's `node_modules`, touch no network, and never replace a real directory.
- `DSH_CHECKOUT` overrides the checkout location when it is not two levels up.

## 3. Contents

- `link-dev.mjs` — symlink the development toolchain from the harness checkout.

## 4. Progress

- Done: links typescript, vitest, jsdom, testing-library, React, cordis, and schemastery.
- Open: nothing.
- Goal later: nothing planned.
