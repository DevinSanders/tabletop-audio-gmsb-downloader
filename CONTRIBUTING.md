# Contributing to Tabletop Audio → GMSB Downloader

Thanks for your interest in contributing. This guide covers getting a dev
environment running, the project's layout, and the non-obvious conventions worth
knowing before you open a PR. The [README](README.md) covers what the app does;
inline comments cover the trickier modules.

## Quick start

Prerequisites: **Node.js 18+** (Node 20 LTS is what CI uses). No other tooling.

```bash
# Replace <your-username> after forking on github.com.
git clone https://github.com/<your-username>/tabletop-audio-gmsb-downloader.git
cd "tabletop-audio-gmsb-downloader"
git remote add upstream https://github.com/DevinSanders/tabletop-audio-gmsb-downloader.git

npm install
npm run dev          # launch the app with hot reload (DevTools available)

npm test             # vitest unit tests
npm run typecheck    # tsc for both the node and web sides
npm run build        # produce out/ bundles
npm run package      # build installers into dist/ (electron-builder)
```

## Project layout

Electron, two processes, written in TypeScript (ESM). Shared types are the
contract between them.

```
src/
  shared/   types + IPC contract (gmsb-schema, manifest, catalog, ledger, ipc,
            variants, usecase) — imported by BOTH processes via the @shared alias
  main/     Node side: manifest, matcher, catalog, ledger, gmsb, auth, patreon,
            soundpad, usecase, service (orchestration), index (lifecycle + IPC)
  preload/  contextBridge bridge exposing the typed API as window.api
  renderer/ React UI (App, components/, lib/filter)
test/       vitest specs + a cached manifest fixture
```

Data flow: `service.buildCatalog` joins the **manifest** (public full versions),
the **Patreon** enumeration (alternates + soundpads), and the **ledger**
(already-downloaded) into a `Catalog` the renderer filters. `service.runDownload`
fetches the selected files, updates the ledger, and regenerates the GMSB library.

## Where to start

- Browse open issues; `good first issue` / `help wanted` are good entry points.
- For anything non-trivial, **open an issue first** so we can agree on the
  approach. Use the bug-report template for bugs.

## Branching & PRs

- Branch off `main`, keep PRs focused, reference the issue (`Closes #123`).
- Before pushing, make sure **`npm run typecheck` and `npm test` pass.** CI runs
  them on every PR and they must be green to merge.
- Add or update tests when you touch the pure modules (matcher, catalog, gmsb,
  soundpad, usecase) — they're the easiest part of the codebase to test and the
  easiest to regress.

## Conventions & footguns

These are the things that aren't obvious from reading the code:

- **Don't re-introduce `patreon-dl`.** It was evaluated and removed: it bundles
  puppeteer (a second Chromium), native `better-sqlite3`, ffmpeg, and its own
  React app — far too heavy for this tool and hostile to cross-platform
  packaging. Patreon access instead reuses **Electron's own persistent session**
  (`persist:patreon` partition in `auth.ts`): the login window populates it, and
  all API calls + downloads go through `session.fetch`, so they run inside
  Chromium's network stack (which clears Cloudflare). No cookies are stored by us.
- **Patreon's internal JSON:API is undocumented.** The endpoint and field shapes
  in `patreon.ts` (`resolveCampaignId`, `buildPostsUrl`, `fetchPatreonContent`)
  follow community conventions and may need updating if Patreon changes. Keep the
  extraction **relationship-agnostic** (scan all relationships, index `included`
  by id) and keep pagination **cursor-based** (`meta.pagination.cursors.next`).
  Everything must degrade to "no Patreon content" rather than throwing — the free
  full versions still work offline of Patreon.
- **`tags_data.js` is JS, not JSON.** The "More filters" taxonomy
  (`usecase.ts`) is parsed from the site's `tags_data.js`, which has `//`
  comments, unquoted keys, and the occasional stray comma. Normalise before
  `JSON.parse` (see `parseUseCaseTags`); add a test case if you find a new quirk.
- **The GMSB library schema is fixed.** `gmsb-schema.ts` mirrors
  `LibraryTransferService.ExportDocument` (Schema 2, PascalCase keys) in the Game
  Master Sound Board source. Exported `FilePath` values are **absolute**; the
  ledger stores **POSIX-relative** paths. Don't change the emitted shape without
  checking it still imports into GMSB.
- **One source of truth for variant buckets.** `deriveVariant(baseType,
  descriptor)` in `variants.ts` decides the 6 buckets and is used by both the
  classifier and the GMSB tag writer. Only **isolation/removal** tokens (`No_X`,
  `Min`) promote a stem to its "Additional" bucket; **version** markers (`Redo
  2025`, `v2`, a year) do not. Change the rule there, not in two places.
- **Sanitise filesystem names.** Pad/file names can contain characters illegal in
  paths (e.g. `Combat: Siege`). Always route on-disk names through
  `sanitizeFsName` (`soundpad.ts`). Display labels keep the original.
- **Never commit account data.** `Downloads/`, `patreon-debug-*.json`, the
  ledger, and the generated library are git-ignored — they contain account info
  and signed download URLs. Keep it that way. Don't paste debug dumps into issues.
- **Match the surrounding style.** Strict TypeScript, ESM imports, no default
  exports for modules, and keep `src/shared` free of Electron/Node-only imports
  so the renderer can use it.

## Releases

Releases are driven by GitHub Actions
([.github/workflows/release.yml](.github/workflows/release.yml)): push a tag like
`v0.1.0` and it builds installers on Windows/macOS/Linux runners and attaches them
to a **draft** GitHub Release for the maintainer to review and publish. Builds are
**unsigned** (no paid code-signing certificates).

## License

This project is licensed under the **MIT License** (see [LICENSE](LICENSE)). By
submitting a contribution you agree it will be released under the same terms.
