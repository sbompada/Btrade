# NTD Trading Dashboard

React/Vite trading workspace with an Express API, replay market data, account workflows, and SQLite-backed demo data.

## Local development

```bash
npm ci
npm run dev:api
npm run dev:web
```

The Vite application runs on port `5173` and proxies `/api` to port `5181`.

## Cloud Run demo

The container serves both the built frontend and API on Cloud Run's `PORT`. Set `NTD_MASTER_KEY` to a 64-character hexadecimal secret and use `/tmp/ntd.db` for the demo database.

> The Cloud Run deployment is a demo environment. Its SQLite database is ephemeral, so accounts, sessions, orders, and settings reset when the container instance is replaced. Use Cloud SQL before treating the service as production.

```bash
gcloud run deploy ntd-app \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars NTD_DB_PATH=/tmp/ntd.db \
  --set-secrets NTD_MASTER_KEY=ntd-master-key:latest
```

## React and Vite notes

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
