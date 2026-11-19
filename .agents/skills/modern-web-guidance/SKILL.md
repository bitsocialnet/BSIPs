---
name: modern-web-guidance
description: Look up browser support and implementation guidance when choosing a native control, focus behavior, browser API, or browser-sensitive layout.
---

From the project root, use the CLI pinned in the lockfile. Search for the browser behavior, then retrieve the matching guide by its returned ID.

```sh
DISABLE_TELEMETRY=1 yarn modern-web-guidance search "open image dialog"
DISABLE_TELEMETRY=1 yarn modern-web-guidance retrieve dialog
```

Apply the relevant guidance to the Astro site in `site/`. Run `yarn build` to check the generated pages and links, and verify the affected browser behavior.
