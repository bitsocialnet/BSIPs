// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import remarkBsipLinks from './src/markdown/remark-bsip-links.mjs';
import remarkPele from './src/markdown/remark-pele.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://bsips.bitsocial.net',
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkBsipLinks, remarkPele],
      rehypePlugins: [
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: 'append',
            properties: { className: ['heading-anchor'], ariaHidden: 'true', tabIndex: -1 },
            content: { type: 'text', value: '#' },
          },
        ],
      ],
    }),
  },
});
