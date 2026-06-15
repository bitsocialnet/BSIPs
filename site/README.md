# BSIPs website

The static website for [bsips.bitsocial.net](https://bsips.bitsocial.net), built with
[Astro](https://astro.build/).

It builds directly from the canonical BSIP markdown in [`../BSIPS`](../BSIPS) (via a content-collection
glob loader), so the site can never drift from the specifications.

## Develop

```bash
cd site
npm install
npm run dev      # local dev server
npm run build    # static build -> dist/
npm run preview  # serve the built output
```

## Deploy

Deployed on Vercel. Build config lives in [`../vercel.json`](../vercel.json): Vercel installs and builds
the `site/` project and serves `site/dist`. Adding a new BSIP markdown file under `../BSIPS` is enough
for it to appear on the site after the next build.
