# BSIPs website

The static website for [bsips.bitsocial.net](https://bsips.bitsocial.net), built with
[Astro](https://astro.build/).

It builds directly from the canonical BSIP markdown in [`../BSIPS`](../BSIPS) (via a content-collection
glob loader), so the site can never drift from the specifications.

The build also checks the BSIPs:

- Each numbered BSIP's preamble is validated against the rules in BSIP-1 (`src/content.config.ts`).
  Unnumbered drafts (`bsip-draft_*.md`) are not published.
- Relative links in the markdown are rewritten: links to other BSIPs become site routes, links to
  other repository files point at GitHub, and a relative link to a missing file fails the build
  (`src/markdown/remark-bsip-links.mjs`).
- ` ```mermaid ` blocks are rendered to static SVG with [Pele](https://github.com/obsidianmd/pele)
  (`src/markdown/remark-pele.mjs`), themed through the `--pele-*` variables in `global.css`.
- After the build, `scripts/check-links.mjs` fails on any internal link to a missing page or anchor.

## Develop

The package lives at the repository root (Yarn 4 via Corepack); run these from there:

```bash
corepack yarn install
yarn start    # dev server through portless at https://bsips.localhost (https://<branch>.bsips.localhost off master)
yarn build    # static build -> site/dist, then the internal link check
yarn preview  # serve the built output
```

`PORTLESS=0 yarn start` runs Astro directly on `http://localhost:4321`.

CI runs `yarn build` on every pull request (`.github/workflows/checks.yml`).

## Deploy

Deployed on Vercel. Build config lives in [`../vercel.json`](../vercel.json): Vercel runs `yarn build` at
the repository root and serves `site/dist`. Adding a new BSIP markdown file under `../BSIPS` is enough
for it to appear on the site after the next build.
