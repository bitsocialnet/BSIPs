import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Build the website directly from the canonical BSIP markdown files in ../BSIPS,
// so the site can never drift from the specifications themselves. The schema enforces the
// preamble rules from BSIP-1, so a malformed BSIP fails the build. Unnumbered drafts
// (bsip-draft_*.md) are not published.

const noBsipNumber = (s: string) => !/\bBSIP-?\s*\d/i.test(s);

// `requires: 2` parses as a number and `requires: 2, 3` as a string.
const bsipList = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const numbers = String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  if (numbers.some((n) => !Number.isInteger(n) || n < 1)) {
    ctx.addIssue({ code: 'custom', message: `"${value}" is not a comma-separated list of BSIP numbers` });
  }
  return numbers;
});

const bsips = defineCollection({
  loader: glob({ pattern: 'bsip-[0-9]*.md', base: new URL('../../BSIPS', import.meta.url) }),
  schema: z
    .object({
      bsip: z.number().int().positive(),
      title: z.string().max(44).refine(noBsipNumber, 'title must not include the BSIP number'),
      description: z.string().max(140).refine(noBsipNumber, 'description must not include the BSIP number'),
      author: z.string().min(1),
      'discussions-to': z.url(),
      status: z.enum(['Draft', 'Review', 'Last Call', 'Final', 'Stagnant', 'Withdrawn', 'Living']),
      'last-call-deadline': z.coerce.date().optional(),
      type: z.enum(['Standards Track', 'Meta', 'Informational']),
      category: z.enum(['Core', 'Networking', 'Interface', 'Appchain', 'Application']).optional(),
      created: z.coerce.date(),
      requires: bsipList.optional(),
      'withdrawal-reason': z.string().optional(),
    })
    .strict()
    .superRefine((fm, ctx) => {
      if ((fm.type === 'Standards Track') !== (fm.category !== undefined)) {
        ctx.addIssue({ code: 'custom', message: 'category is required for Standards Track BSIPs and only for them' });
      }
      if ((fm.status === 'Last Call') !== (fm['last-call-deadline'] !== undefined)) {
        ctx.addIssue({ code: 'custom', message: 'last-call-deadline is required while status is Last Call, and only then' });
      }
      if (fm['withdrawal-reason'] !== undefined && fm.status !== 'Withdrawn') {
        ctx.addIssue({ code: 'custom', message: 'withdrawal-reason is only allowed on Withdrawn BSIPs' });
      }
    }),
});

export const collections = { bsips };
