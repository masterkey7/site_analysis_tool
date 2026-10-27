# v0.1.0 validation record

[简体中文](validation.md) | English

Date: 2026-10-27. Environment: Windows, Node v24.19.0.

- Installed locked dependencies successfully with `npm ci` in a clean release directory.
- `npm test`: 62 passed, 0 failed.
- `npm run check`: all dependencies resolve from this repository's node_modules; sharp generated an actual 8 × 8 PNG; the working directory is writable.
- Real local HTTP checks passed for the home page and static assets, unconfigured startup, rejection of unconfirmed site input, and isolation of private files.
- The committed repository excludes local map credentials, personal projects, node_modules, tile caches, and reference PDFs. A comparison against the local credential values found no keys in release files.
- Existing map visuals and application source were preserved from the development copy. Runtime dependencies, documentation, and the agent entry point were organized for portable use.

This release preparation did not retest live search, place queries, or satellite downloads using a real map account, and did not perform a complete real-browser interaction check. Other operating systems, map-provider authorization, and public multi-user deployment were outside this validation scope.

The English documentation update does not change application code. The results above describe the v0.1.0 release validation; they are not a claim of new live-provider or browser tests.
