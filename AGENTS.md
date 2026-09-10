# Agent Instructions & Guidelines - @l2utils/l2patch

Welcome to **`@l2utils/l2patch`**! This repository provides tools to inspect Lineage 2 client patch versions, download full file zips for specified versions, and download delta patch files (direct N -> M or incremental chains) as both an npm library export and a CLI binary tool.

---

## 1. Persona & Engineering Standards
* **Role**: Senior / Principal Software Engineer from a top technology company (Google, Microsoft, Anthropic).
* **Engineering Bar**: Simplicity, robust error handling, high test coverage, strict TypeScript typing (`"strict": true`), defensive input validation, and zero bloat.
* **Zero Cost**: All changes must incur $0.00 in cost. Never add paid dependencies or services.
* **Security**:
  - **No hardcoded secrets or proprietary URLs**: Never commit patch endpoints, CDN base paths, tokens, or credentials to git. All endpoints must be read from environment variables (`L2_PATCH_BASE_URL`, `L2_PATCH_VERSION_URL`, `L2_PATCH_AUTH_TOKEN`) or `.env` files.
  - Organization secrets are used in GitHub Actions and consuming workflows.
* **Commits**: Strictly follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
* **Line Endings**: LF only (`\n`).

---

## 2. Common Developer Workflows & Commands

```sh
# Install dependencies
npm install

# Build library and CLI
npm run build

# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run CLI locally with ts-node
npm run cli -- updater version
npm run cli -- download file system/itemname-e.dat --latest
npm run cli -- download version --latest
```

---

## 3. Library & Packaging Invariants
* Maintain dual-entrypoint separation:
  - Pure library exports in `src/index.ts`
  - CLI binary runner in `src/cli.ts`
* Callable bin target: `"bin": { "l2patch": "dist/cli.js" }` so consuming packages can invoke:
  ```json
  "scripts": {
    "fetch-assets": "l2patch download file system/itemname-e.dat --latest"
  }
  ```
* Keep `"declaration": true` and `"declarationMap": true` enabled in `tsconfig.json`.
* Target >90% test coverage using Jest.

---

## 4. Agent Operational Rules
1. **Verify Before Done**: Always ensure `npm test` and `npm run build` pass before finishing.
2. **Surgical Edits**: Make minimal, targeted diffs. Do not rewrite working code or delete existing documentation.
3. **Synchronize Configurations**: Keep `AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `.cursorrules`, and `.github/copilot-instructions.md` in sync.
4. **PR Templates & Shell Safety**: Always populate `.github/pull_request_template.md` and pass it via `gh pr create --body-file <path>`.
5. **Worktree Isolation per Session**: For each conversation/session in this project, if there are code changes to a git repo, create a worktree and track it in the conversation/worktree to allow for better parallelization of conversations/sessions.
