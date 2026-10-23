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

```bash
cd site
npm install
npm run dev      # local dev server
npm run build    # static build -> dist/, then the internal link check
npm run preview  # serve the built output
```

CI runs `npm run build` on every pull request (`.github/workflows/site.yml`).

## Deploy

Deployed on Vercel. Build config lives in [`../vercel.json`](../vercel.json): Vercel installs and builds
the `site/` project and serves `site/dist`. Adding a new BSIP markdown file under `../BSIPS` is enough
for it to appear on the site after the next build.
