# Repository guidance

- This is a local Node.js and vanilla JavaScript app. dist/ contains maintained source and required assets; do not delete it or invent a frontend build step.
- Read README.md and docs/architecture.md before changes. Use npm ci, npm test and npm run check for validation.
- Never commit .local/, .env files, credentials, node_modules, live query caches, reference PDFs or personal project exports.
- Preserve user confirmation of the design boundary, independent project names, geographic coordinate consistency, current-frame export, attribution and 1.2x desktop controls without scaling the legend/map.
- Keep the current fixed presets and manual annotation model. Do not add AI editing, cloud accounts, billing or public deployment unless requested.
- Real provider and browser tests are separate from mocked automated tests. Report limits accurately.
