# Web Slide Editor

A browser-based slide editor built with React and TypeScript. It runs entirely in the browser, saves presentations locally, and exports slides through the browser's PDF print flow.

[Live demo](https://0000workjason.github.io/web-slide-editor/)

## Features

- Create, duplicate, reorder, skip, and delete slides.
- Add editable text, PNG/JPEG images, rectangles, ellipses, lines, and arrows.
- Drag, resize, marquee-select, group, align, distribute, and reorder elements.
- Lock element positions, adjust opacity, and crop or replace images.
- Undo and redo up to 50 document changes.
- Save automatically to IndexedDB and restore after reopening the browser.
- Download and import a validated JSON project backup with embedded images.
- Present with keyboard navigation or export one PDF page per visible slide.

## Local Development

Node.js 24 and npm 12 are recommended.

```bash
npm install
npm run dev
```

Open the URL shown by Vite in a desktop version of Chrome or Edge.

## Quality Checks

```bash
npm test
npm run lint
npm run build
```

With the development server running, `npm run validate:edge` exercises the complete authoring, persistence, presentation, backup, and PDF workflow in headless Microsoft Edge.

## Architecture

- `src/model/` contains the serializable presentation schema.
- `src/editor/` contains reducers, history, geometry, and pointer logic.
- `src/components/` contains interactive and static slide renderers.
- `src/storage/` stores documents and image Blobs in IndexedDB.
- `src/print/` prepares the shared renderer for browser PDF output.

The document uses a fixed 1600 × 900 logical canvas. Zoom affects rendering and pointer translation only, so saved coordinates remain stable.

## Data and Scope

Presentation data remains in the current browser profile unless the user downloads a project backup. The project targets desktop Chrome and Edge. Cloud collaboration, accounts, PPTX compatibility, and animations are outside the current scope.
