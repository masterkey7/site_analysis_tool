# Architecture and product constraints

[简体中文](architecture.md) | English

## File map

| File | Responsibility |
|---|---|
| serve.mjs | Local HTTP server, static-file allowlist, map proxy, credential storage, analysis interface |
| analysis.mjs / discovery.mjs | Input validation, city/extent queries, candidate filtering, ranking, deduplication |
| basemap-service.mjs | OpenFreeMap tiles, dynamic extent cache, SVG/PNG rasterization |
| sharp-runtime.mjs | The project's local sharp dependency |
| dist/app.js | Search, site confirmation, editing state, UI, generation and export |
| dist/core.js / analysis-data.js | Data structures, validation, project migration, merging manual refinements |
| dist/analysis-svg.js / scene.js / basemap.js | Legends, annotations, basemaps, shared scene rendering |
| dist/satellite-export.js / png-export.js | Satellite capture, PNG composition, resource cleanup |
| dist/project-storage.js | Local storage, version conflicts, backup prompts |
| dist/workbench.css | Floating map workspace; desktop 1.2× UI rules at the end |
| tests / samples | Behavioral regression tests and explicitly named test fixtures |

There is no separate frontend build step. The files in dist/ are maintained source, not disposable compiled output. This version does not use React or Next.js.

## Geometry and state

The user-defined site boundary, geographic place anchors, label offsets, city-map extent, and hand-drawn annotations are distinct objects. Search `chooseResult` only moves the view. `setSiteName` updates `state.name` and `analysis.site.name`. `acceptDrawing` does not derive the project name from a search term. `siteConfirmed` gates analysis and export.

Use the current source as the authority for data structures. Do not edit JSON to bypass the user's boundary confirmation. Existing GCJ-02 display coordinates and WGS84 data conversion must remain consistent. A provider migration requires checking boundaries, places, tiles, and exported positions together; replacing only a basemap URL is insufficient.

## Automatic identification

The app queries, filters, ranks, and arranges place data. It does not infer functional areas from imagery. Currently it shows up to 22 places automatically and keeps up to 48 candidates; discovery.mjs is the source of truth. Administrative boundaries, actual design boundaries, and manual illustrative circles are not interchangeable. Preserve custom names, label positions, and hidden states when matching the same place.

## Output and visual behavior

Preserve the large map with floating tools, four styles, visible distance rings, lightweight drawing, and single-diagram output. Do not automatically add a large title, a full presentation page, an AI chat panel, login, or billing. Names and legends must follow the project and administrative area rather than being hard-coded to Hangzhou.

CSS applies 1.2× sizing only to desktop UI controls. SVG legends, scale bars, and the map workspace do not scale with them. A generated image preview does not verify the exact CSS scale.
