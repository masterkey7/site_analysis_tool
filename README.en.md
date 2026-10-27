# Site Analysis Tool · v0.1.0

[简体中文](README.md) | English

A local map workspace for early-stage architectural site analysis, primarily for projects in mainland China. Find a reference location, define the actual design site, query important places nearby, refine annotations, and export a single high-resolution analysis diagram.

This is the English documentation edition. The application interface is currently in Chinese; adding these documents does not translate the UI or place names.

## Quick start

Install Node.js 22 or 24 with npm. You will also need a modern browser and an internet connection. Run these commands from the repository root:

```sh
npm ci
npm test
npm run check
npm start
```

Open http://127.0.0.1:4173/ . In **地图配置** (Map settings), enter your own AMap (Gaode) Web JS API key and matching security code. Do not put credentials in source files or commit them to Git.

Local credentials are stored in `.local/amap.json`, which is excluded from Git. The workspace can open without credentials, but live search, satellite imagery, and nearby-place queries require valid credentials. The server listens on localhost only; this is not a publicly hosted website.

## Workflow

1. Search for a city, address, or nearby landmark such as a school. The search term does not become the project name.
2. Pan to the actual parcel, draw a rectangle or polygon, explicitly confirm the design boundary, and enter a project name.
3. Adjust the wider map extent independently, then generate the context analysis. The app queries transport hubs, commercial centers, parks, and public facilities within the city and map extent, then filters, ranks, and arranges their labels.
4. Choose Light linework, Moss green, Dark linework, or Satellite. Move or edit labels and add solid or dashed lines, arrows, areas, and text.
5. Export the current output frame as PNG or SVG. The default high-resolution PNG is 4800 × 3600. Map attribution stays in the image; floating controls do not.
6. Projects are saved in the current browser. Download and import JSON backups to transfer or restore them. There are no user accounts or cloud saves.

## Repository layout

```text
serve.mjs              Local server, configuration, and map proxy
analysis.mjs           Query orchestration and analysis interface
discovery.mjs          Place filtering, ranking, and deduplication
basemap-service.mjs    Dynamic map extents and layers
dist/                  Maintained frontend source and basemap assets
tests/                 Automated regression tests
vendor/                Bundled third-party code and original licenses
samples/               Hangzhou and Liangzhu test data
scripts/               Environment and local HTTP checks
docs/                  Architecture, workflow, validation, and distribution
SKILL.md               Agent entry point, with an English companion
```

**There is no separate frontend build step. `dist/` is not disposable build output.** The repository includes Hangzhou basemap data for the initial view and regression reproduction. New regions are loaded online for the current viewport.

## Current limitations

- Automatic identification uses place queries and filtering rules. It does not infer actual land-use boundaries from imagery. Users must confirm the design boundary.
- Satellite export depends on AMap layers, network access, and browser canvas access. Cross-origin failures and timeouts must be reported; success is not guaranteed in every environment.
- SVG exports embed the basemap as raster imagery; analysis overlays and hand-drawn annotations are vectors. The entire map is not vector data.
- Validation currently focuses on Windows and Node 24. Mocked tests do not replace real map and browser acceptance checks.
- There is no multi-user system, login, billing, visit analytics, or public deployment. This repository is a private source baseline.

## Working with an agent

Ask the agent to read [SKILL.en.md](SKILL.en.md) and [AGENTS.md](AGENTS.md), then install dependencies, run checks, and start the local app. Credentials should be entered in the settings page, not shared in chat. Test data or API calls must not bypass user confirmation of the site.

Further reading: [Workflow and acceptance](docs/workflow.en.md), [Architecture](docs/architecture.en.md), [Validation record](docs/validation.en.md), and [Changelog](CHANGELOG.en.md).

## Rights and map sources

The original application has not been released under a public open-source license. This repository is for private development. Third-party dependencies, map data, and imagery retain their own terms; see [NOTICE.en.md](NOTICE.en.md) and [Distribution boundaries](docs/distribution.en.md). Uploading the code privately does not establish commercial authorization for map services.
