import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// Build the website directly from the canonical BSIP markdown files in ../BSIPS,
// so the site can never drift from the specifications themselves.
const bsips = defineCollection({
  loader: glob({ pattern: '*.md', base: new URL('../../BSIPS', import.meta.url) }),
});

export const collections = { bsips };
