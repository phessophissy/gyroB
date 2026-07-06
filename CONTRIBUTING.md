# Contributing to GyroB

Thanks for contributing to Gyro Board.

## Development Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file and set local values:

```bash
cp .env.example .env
```

3. Start the frontend:

```bash
npm run dev
```

4. Run the core checks before opening a PR:

```bash
npm run compile
npm test
npm run build
```

## Project Standards

- Keep the game mechanics deterministic.
- Do not change the `1-10` spin range or `10` player round cap unless the spec changes.
- Preserve room isolation across entry-fee tiers.
- Avoid committing secrets, funded wallet material, or local `.env` files.
- Read [SECURITY.md](SECURITY.md) before touching batch wallet scripts or deployment keys.
- Never commit `generated/`, `*.pem`, `*.key`, or files containing private keys.

## Pull Requests

- Use small, focused commits.
- Explain gameplay impact clearly.
- Include validation notes for contract and frontend changes.
- Prefer screenshots for UI updates.

- CI runs contract tests and frontend build on every PR.
- Frontend changes under frontend/ trigger Vercel rebuilds.
- Read docs/architecture.md before large changes.
