# Site workflow and acceptance

[简体中文](workflow.md) | English

## Inputs and interaction

1. Search for a city, address, or nearby landmark. Results only help locate the site; a user may find a school and then pan to an adjacent parcel.
2. Enter a project name and draw a rectangle or polygon around the design site. The user must confirm the actual boundary. If no boundary exists, ask the user to draw it on the map; do not present a test rectangle as a surveyed boundary.
3. Confirm the site, then independently adjust the city-map extent and output aspect ratio.
4. Generate analysis: query transport hubs, commercial centers, parks, and public facilities based on the city and current extent; deduplicate, rank, classify, and arrange labels. Report query failures accurately.
5. Drag labels, rename or hide places, or draw lines, polylines, arrows, areas, and text. Support solid and dashed strokes.
6. Choose Light linework, Moss green, Dark linework, or Satellite. Satellite mode uses grayscale imagery with colored analysis overlays. Distance rings should remain clearly visible.
7. Export a high-resolution PNG. Linework modes also support SVG with an embedded basemap. Satellite format support depends on the running version; do not promise offline access to original satellite imagery.
8. Download a JSON project backup and import it to confirm that names, boundaries, and manual adjustments are retained. Browser autosave belongs to that device, browser profile, and site origin.

## Automated validation

`npm test` covers controllers, the proxy, input validation, classification and filtering, cross-city data handling, naming, cancellation, storage conflicts, and scene composition. Hangzhou and Liangzhu fixtures are regression samples, not substitutes for queries at arbitrary sites.

## Real-browser checklist

State which checks were actually completed in each handoff:

- Analysis and export remain blocked until the boundary is confirmed; redrawing invalidates the previous confirmation.
- Search for a school → pan → draw a different parcel → name it “Test residential project” → confirm → analyze. SITE retains the project name. Searching again does not rename the project.
- Test a new case outside Hangzhou. Important places must match the actual city and map extent; candidates can be hidden and labels adjusted.
- All four styles visibly differ. Desktop controls use 1.2× sizing while the legend and scale bar retain their size. Controls must not obstruct required operations.
- Dragging text does not move its geographic anchor. Undo, redo, stroke styles, and cancel-edit work.
- Download an actual PNG and open it: check for basemap imagery and annotations, no editing controls, correct pixel dimensions, and correspondence with the output frame. Test satellite export separately.
- JSON export/import restores edits. A new project does not inherit the previous project's name or boundary.
- The interface remains usable on short screens, at different zoom levels, with long place names, and after network failures.

Do not replace real output with AI-generated map screenshots. If browser control is unavailable, the user can perform the steps and report the result. Clearly distinguish passed code tests from unverified visual behavior.
