import { getCollection } from 'astro:content';

export const GITHUB_REPO_URL = 'https://github.com/bitsocialnet/BSIPs';

export async function getBsips() {
  const entries = await getCollection('bsips');
  return entries.map((entry) => ({ id: entry.id, body: entry.body ?? '', ...entry.data })).sort((a, b) => a.bsip - b.bsip);
}

export type Bsip = Awaited<ReturnType<typeof getBsips>>[number];

// One index section per Standards Track category, plus Meta and Informational, in BSIP-1's order.
const GROUPS = [
  { key: 'Meta', description: 'Processes around Bitsocial, including how BSIPs themselves work.' },
  { key: 'Informational', description: 'Design notes and guidelines that do not propose a feature.' },
  { key: 'Core', description: 'The interoperability rules of the protocol: data formats, validation, signatures, challenges and addressing.' },
  { key: 'Networking', description: 'Peer discovery and transport: HTTP routers, pubsub, content transfer and browser peer-to-peer.' },
  { key: 'Interface', description: 'Developer interfaces shared across clients: the RPC protocol and client SDK conventions.' },
  { key: 'Appchain', description: 'The Bitsocial Network economic layer: .bso names, the token, tipping and on-chain standards.' },
  { key: 'Application', description: 'Conventions independent clients agree on above the protocol.' },
] as const;

export type Group = (typeof GROUPS)[number];

export function getGroupKey(bsip: Pick<Bsip, 'type' | 'category'>): Group['key'] {
  return bsip.type === 'Standards Track' ? bsip.category! : bsip.type;
}

export function groupBsips(bsips: Bsip[]) {
  return GROUPS.map((group) => ({ ...group, slug: group.key.toLowerCase(), bsips: bsips.filter((b) => getGroupKey(b) === group.key) })).filter(
    (group) => group.bsips.length > 0,
  );
}

/** BSIPs that list `bsip` in their `requires` preamble field. */
export function getRequiredBy(bsips: Bsip[], bsip: number) {
  return bsips.filter((b) => b.requires?.includes(bsip));
}

/** "draft", "last-call": the status as a CSS-friendly token. */
export const statusSlug = (status: string) => status.toLowerCase().replace(/\s+/g, '-');

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** BSIP-1 authors: "Name (@github)" or "Name <email>", comma-separated. Emails are not shown. */
export const parseAuthors = (author: string) =>
  author
    .split(',')
    .map((part) => {
      const github = part.match(/\(@([\w-]+)\)/)?.[1];
      const name = part.replace(/\s*[(<][^)>]*[)>]\s*/g, '').trim();
      return { name, github };
    })
    .filter((a) => a.name);
