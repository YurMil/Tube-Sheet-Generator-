# Tube Sheet Generator

Standalone Vite micro-application for generating tube sheet layouts with DXF and STEP export.

The built application is published into the CAD AutoScript host site at:

```text
static/utility-apps/tube-sheet-generator/app.html
```

## Local Development

```bash
pnpm install
pnpm dev
```

## Production Build

```bash
pnpm typecheck
pnpm build
```

The production bundle is emitted to `dist/` with:

- `app.html`
- `assets/*`
- `manifest.json`
- `checksums.json`

## Deployment

The GitHub Actions workflow builds this app, uploads a static artifact, and deploys `dist/` into `biosxxx/cadautoscript.com`.

Required repository secret:

```text
DEPLOY_TOKEN
```

The token must have permission to push to the host repository.
