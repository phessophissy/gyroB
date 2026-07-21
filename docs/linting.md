# Linting

GyroB lints JavaScript with ESLint 9 using the flat config in
[`eslint.config.js`](../eslint.config.js).

## Running

```bash
npm run lint       # check
npm run lint:fix   # auto-fix where possible
```

The scripts lint the `frontend/`, `scripts/`, and `test/` directories
plus the config file itself.

## Configuration

- Base: `@eslint/js` recommended.
- `languageOptions`: ES2023, ESM, browser + node globals.
- `rules`: `no-undef` errors, `no-unused-vars` warnings (ignoring
  args prefixed with `_`), `no-console` off.
- `ignores`: `node_modules/`, `dist/`, `artifacts/`, `cache/`.

## CI

The `lint` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
runs `npm run lint` and `npm run test:format` on every push and pull
request to `main`. A failing lint check blocks the PR.
