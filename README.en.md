# Site Analysis Tool · v0.1.0

[简体中文](README.md) | English

**Define a site, organize its surroundings, refine the annotations, and export an architectural analysis diagram.**

A local map workspace for early-stage architectural design, primarily for projects in mainland China. Search, city-context analysis, map styles, and manual annotations come together on one page.

![Hangzhou Olympic Sports Centre context diagram with a moss-green basemap, nearby places, distance rings, and a legend](docs/images/hangzhou-moss.png)

*Hangzhou Olympic Sports Centre sample · Moss green. Rendered by the current export code from bundled test data, with map attribution retained. Illustrative extents are not surveyed project boundaries.*

<details>
<summary>See the same site in Light and Dark styles</summary>

| Light linework | Dark linework |
|---|---|
| ![Hangzhou light linework](docs/images/hangzhou-light.png) | ![Hangzhou dark linework](docs/images/hangzhou-dark.png) |

The same data and extent, with a different map style. Satellite mode loads imagery online after the user configures the map service; no satellite screenshot is included in this gallery.

</details>

## What you can do

| Feature | How it helps |
|---|---|
| Search and confirm the site | Search for an address or nearby school, then pan to the actual parcel and draw its boundary. Set the project name yourself. |
| Analyze nearby places | Query transport hubs, commercial centers, parks, and public facilities by city and map extent; filter, rank, and arrange their labels. |
| Choose from four styles | Light linework, Moss green, Dark linework, and grayscale satellite imagery with analysis overlays. |
| Refine directly on the page | Move or rename labels, hide places, and draw solid or dashed lines, arrows, areas, and text, with undo and redo. |
| Export one high-resolution diagram | Export the current output frame as PNG or SVG. Default PNG size is 4800 × 3600; editing controls are excluded and map attribution stays visible. |
| Save and restore projects | Autosave in the current browser, or download and import JSON backups to continue editing. |

## Get started

You need **Node.js 22 or 24 with npm, a modern browser, internet access, and your own AMap (Gaode) Web JS API key with its matching security code**. The app runs on your computer. Its interface is currently in Chinese; this English edition covers documentation.

### 1. Get the project

On the repository page, select **Code → Download ZIP** and extract it, or clone the repository with Git. You do not need to fork it just to run the tool. The repository is currently private; downloading requires an account with access.

### 2. Start the app using either option

**With an AI agent:** open the extracted project folder in an agent that can access local files and a terminal, then ask:

```text
Read README.en.md, SKILL.en.md, and AGENTS.md in this project.
Check the runtime, install locked dependencies, run the tests and environment
checks, then start the local web app. I will enter my map API key and security
code in the settings page; do not put them in source files or upload them.
```

**Manually:** open a terminal in the project folder containing package.json and run:

```sh
npm ci
npm test
npm run check
npm start
```

Open http://127.0.0.1:4173/ and keep the server terminal running.

### 3. Configure the map

Select **地图配置** (Map settings) in the app and enter your own AMap JS API key and matching security code. They are saved locally in `.local/amap.json`, which is excluded from Git. Do not share credentials in chat, put them in source files, or commit them.

The workspace can open without configuration, but live search, nearby-place queries, and satellite imagery require valid credentials and network access.

### 4. Create your first diagram

1. **Find and confirm the design site:** search for a reference location, pan to the real parcel, draw a rectangle or polygon, set the project name, and confirm the boundary. Searching for a school does not make it the project name.
2. **Set the wider analysis extent:** adjust the map viewport and output aspect ratio independently, then generate the nearby-place analysis.
3. **Choose a style and refine the layout:** rename or move labels, hide places, and add lines or text as needed.
4. **Export and save:** export the current frame as PNG or SVG, and download a JSON project backup.

For detailed instructions and acceptance checks, see [Workflow and acceptance](docs/workflow.en.md).

## Code structure and development

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
docs/                  Guides, architecture, validation, and output examples
SKILL.md               Agent entry point, with an English companion
```

**There is no separate frontend build step. dist/ is not disposable build output.** Bundled Hangzhou data supports the initial view and regression reproduction; new regions load online for the current viewport. Before editing, read [Architecture](docs/architecture.en.md) and [AGENTS.md](AGENTS.md).

[Agent instructions](SKILL.en.md) · [Validation record](docs/validation.en.md) · [Changelog](CHANGELOG.en.md)

## Current boundaries

- Automatic annotations come from place queries and filtering rules, not image-based inference of actual land-use boundaries. Users must confirm the design boundary.
- Satellite export depends on map layers, the network, and browser access. Cross-origin failures and timeouts are reported; success is not guaranteed in every environment.
- SVG embeds the basemap as raster imagery; analysis overlays and manual annotations are vectors. The whole map is not vector data.
- v0.1.0 passed 62 automated tests on Windows / Node 24. This does not replace full acceptance with live map services and a real browser. These gallery renders are not evidence of new live-provider acceptance tests.
- This is a local tool without accounts, cloud saves, multi-user operation, billing, or visit analytics. Uploading the repository does not publish a hosted web app.

## Rights and map sources

The original application has not been released under a public open-source license. This repository is for private development. Third-party dependencies, map data, and imagery retain their own terms; see [Third-party notices](NOTICE.en.md) and [Distribution boundaries](docs/distribution.en.md). A private upload does not establish commercial authorization for map services.
