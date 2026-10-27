---
name: site-analysis-tool
description: Run, maintain, and reuse this local architectural site-analysis app through user-confirmed boundaries, map queries, manual refinements, and high-resolution single-diagram exports.
---

# Site Analysis Tool v0.1

[简体中文](SKILL.md) | English

This is the English companion to the canonical SKILL.md entry point. The skill and runnable application share this repository. Read [README.en.md](README.en.md) first. From the repository root, use Node.js 22 or 24 and npm to run `npm ci`, `npm test`, and `npm run check`, then `npm start`. Open http://127.0.0.1:4173/ . Do not copy another computer's node_modules or rely on a private Codex runtime.

## Execution constraints

- Read [Workflow and acceptance](docs/workflow.en.md) for user operations and real-browser checks. Read [Architecture](docs/architecture.en.md) before changing code.
- Users enter their own AMap credentials on the settings page. Never commit .local, .env files, personal project files, or access tokens.
- Search provides a location reference; the project name is independent. Analysis and export require explicit confirmation of the actual design boundary. The wider city-map extent is independent.
- Automatic annotations must come from real queries, filtering, and layout. Do not invent place names or unsupported functional-area boundaries.
- Preserve four presets, lightweight drawing, and desktop controls at 1.2× size. Keep the map, legend, and scale bar at their original sizes.
- Export the current output frame, exclude editing controls, and retain third-party map attribution.
- Do not add AI chat editing, accounts, payments, or public deployment unless explicitly requested.
- Automated tests establish only the behavior they cover. Live search, map display, and actual satellite-image downloads require separate browser acceptance checks.

The handoff must include the local URL, test results, credential-configuration status, and unverified behavior. See [Distribution boundaries](docs/distribution.en.md). The original standalone skill snapshot is not duplicated in this repository. The application UI remains in Chinese.
