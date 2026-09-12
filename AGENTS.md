# Repository Guidelines

## Project Structure & Module Organization

This repository contains a React and TypeScript browser-based slide editor. Keep serializable document types in `src/model/`, editing logic in `src/editor/`, interactive views in `src/components/`, print preparation in `src/print/`, and IndexedDB access in `src/storage/`. Tests live beside the module they verify as `*.test.ts` or `*.test.tsx`.

Separate presentation data from interface state. Selection, text focus, drag previews, and canvas zoom must not enter the saved document. Store element positions and sizes in the fixed 1600 × 900 logical coordinate system; apply zoom only while rendering or translating pointer movement.

## Build, Test, and Development Commands

- `npm install` installs the versions recorded in `package-lock.json`.
- `npm run dev` starts the Vite development server.
- `npm test` runs the Vitest suite once.
- `npm run test:watch` runs tests while developing.
- `npm run lint` checks TypeScript and React rules with ESLint.
- `npm run build` type-checks and creates the production bundle in `dist/`.

Run test, lint, and build checks before opening a pull request.

## Coding Style & Testing

Use UTF-8, LF line endings, two-space indentation, and the repository ESLint configuration. Use `PascalCase` for React components and exported types, `camelCase` for functions and variables, and prefix hooks with `use`.

Use Vitest and React Testing Library. Test observable behavior and pure state transitions. Coordinate tests must cover multiple zoom factors. Text editing changes must verify that shortcuts do not interrupt Chinese IME composition. Keep fixtures deterministic and avoid live services or machine-specific paths.

## Commits & Pull Requests

Use concise imperative subjects, preferably `type(scope): summary`, such as `feat(canvas): add text dragging`. Pull requests should describe the user-visible result, list validation performed, link relevant issues, and include screenshots for interface changes. Identify saved-data format changes and known limitations.

## Security & Configuration

Never commit credentials, tokens, local environment files, browser profiles, or user presentation data. Validate imported projects before replacing the current document.
Run `npm run security:check` before every push. Do not bypass the repository's pre-push hook; stop and inspect every reported match.
