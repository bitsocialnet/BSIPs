// @ts-check
// Build the BSIP-13 seed list: the .bso names the interim registry registers at launch.
//
// 1. Scan Ethereum mainnet up to snapshot block S for every ENS `TextChanged` event with the key
//    `bitsocial`, from any contract, and map each event node to a name where it can.
// 2. Add the supplied names in supplied-names.json.
// 3. Confirm every candidate at block S (rule 1): an ENSIP-15 normalized .eth name, registered and,
//    for a second-level name, not past ENS's grace period, with a non-empty `bitsocial` record on its
//    own onchain resolver that the Universal Resolver agrees with. Record its holder. Names migrated
//    to ENSv2, or registered there, are read from the ENSv2 registries.
// 4. Add the ancestors of every subname (rule 2) and the reserved names in reserved.json (rule 3).
// 5. Leave out entries the registry cannot hold (label, depth, zero-address holder) and everything
//    under them.
// 6. Write seed-list.json and, once every owner is known, seed-tree.json, the OpenZeppelin
//    StandardMerkleTree whose root is SEED_ROOT.
//
// Usage:
//   RPC_URL=<mainnet RPC> node assets/bsip-13/build-seed-list.mjs [--block <S>]
//   RPC_URL=<mainnet RPC> node assets/bsip-13/build-seed-list.mjs --check
//
// --block  snapshot block S. Default: the latest finalized block.
// --check  rebuild at the block recorded in seed-list.json and fail if the output differs.
//
// The RPC must serve archive state and eth_getLogs over the whole chain with topic filters. Ranges it
// refuses are split until it accepts them.
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { ens_normalize } from '@adraffy/ens-normalize';
import {
  concat,
  createPublicClient,
  decodeAbiParameters,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  hexToBigInt,
  http,
  isAddressEqual,
  keccak256,
  labelhash,
  namehash,
  parseAbi,
  parseAbiItem,
  toEventSelector,
  toHex,
  zeroAddress,
} from 'viem';
import { mainnet } from 'viem/chains';
import { isReadFromV2, readV2, retry } from './ens-v2.mjs';

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const ENS_OLD_REGISTRY = '0x314159265dD8dbb310642f98f50C066173C1259b';
const ENS_FIRST_BLOCK = 3327417n; // the original ENS registry's deployment; no ENS record predates it
const BASE_REGISTRAR = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85';
const NAME_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const ENS_GRACE_PERIOD = 90n * 86400n; // v1
const ETH_NODE = namehash('eth');
const KEY = 'bitsocial';
const MAX_SUBDOMAIN_DEPTH = 10; // upstream NameNFT
const MIN_TOP_LEVEL_CODE_POINTS = 3; // BSIP-13 change 5
const LEAF_ENCODING = ['string', 'uint256', 'address', 'string'];

const TEXT_CHANGED = [
  toEventSelector('TextChanged(bytes32,string,string)'),
  toEventSelector('TextChanged(bytes32,string,string,string)'),
];
const NEW_OWNER = toEventSelector('NewOwner(bytes32,bytes32,address)');
const TRANSFER = toEventSelector('Transfer(address,address,uint256)');
const NAME_WRAPPED = parseAbiItem(
  'event NameWrapped(bytes32 indexed node, bytes name, address owner, uint32 fuses, uint64 expiry)',
);
const NAME_WRAPPED_TOPIC = toEventSelector(NAME_WRAPPED);
const registryAbi = parseAbi([
  'function owner(bytes32 node) view returns (address)',
  'function resolver(bytes32 node) view returns (address)',
]);
const registrarAbi = parseAbi([
  'function nameExpires(uint256 id) view returns (uint256)',
  'function ownerOf(uint256 id) view returns (address)',
]);
const resolverAbi = parseAbi(['function text(bytes32 node, string key) view returns (string)']);
const extendedResolverAbi = parseAbi(['function resolve(bytes name, bytes data) view returns (bytes)']);

const dir = new URL('./', import.meta.url);
const read = (file) => readFileSync(new URL(file, dir), 'utf8');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const log = (...parts) => console.error(...parts);

const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
  log('Set RPC_URL to an Ethereum mainnet RPC with archive state and unbounded eth_getLogs.');
  process.exit(2);
}
const client = createPublicClient({
  chain: mainnet,
  transport: http(rpcUrl, { retryCount: 3, timeout: 120_000 }),
  ccipRead: false, // offchain (EIP-3668) records are not seeded
});

// --- inputs ---

const reserved = JSON.parse(read('reserved.json'));
const supplied = JSON.parse(read('supplied-names.json'));
checkReservedAgainstBsip(reserved);

const check = flag('--check');
const previous = check ? JSON.parse(read('seed-list.json')) : undefined;
const blockArg = check ? String(previous.snapshot.block) : option('--block');
const block = await client.getBlock(blockArg ? { blockNumber: BigInt(blockArg) } : { blockTag: 'finalized' });
const S = /** @type {bigint} */ (block.number);
const timestamp = block.timestamp;
log(`snapshot block S = ${S} (${new Date(Number(timestamp) * 1000).toISOString()})`);

// --- 1. TextChanged logs ---

const textLogs = await getLogs({ topics: [TEXT_CHANGED, null, keccak256(toHex(KEY))] }, ENS_FIRST_BLOCK, S);
/** @type {Map<string, { resolvers: Set<string>, transactions: Set<string> }>} */
const logNodes = new Map();
for (const l of textLogs) {
  const node = l.topics[1];
  if (!logNodes.has(node)) logNodes.set(node, { resolvers: new Set(), transactions: new Set() });
  logNodes.get(node).resolvers.add(getAddress(l.address));
  logNodes.get(node).transactions.add(l.transactionHash);
}
log(`${textLogs.length} TextChanged events for "${KEY}" on ${logNodes.size} nodes`);

// --- map event nodes to names ---

// BSIP-10 clients normalize a name before resolving it, so a supplied name is taken normalized.
const suppliedNames = [
  ...new Set([...supplied.lists.names, ...supplied.owners.map((o) => o.name)].map((n) => toEth(normalizeOrKeep(n)))),
];
/** @type {Map<string, string>} node -> name */
const nameOf = new Map([[ETH_NODE, 'eth']]);
/** @type {Map<string, { parent: string, labelhash: string }>} unmapped node -> what is known */
const partial = new Map();
const learn = (name) => {
  const labels = name.split('.');
  for (let i = 0; i < labels.length; i++) {
    const suffix = labels.slice(i).join('.');
    nameOf.set(namehash(suffix), suffix);
  }
};
suppliedNames.forEach(learn);
await mapNodes([...logNodes.keys()]);
const unmapped = [...logNodes.keys()].filter((node) => !nameOf.has(node));
log(`${logNodes.size - unmapped.length} event nodes mapped, ${unmapped.length} unmapped`);

// --- 2-3. confirm candidates at S ---

/** @type {Map<string, Set<string>>} candidate .eth name -> sources */
const candidates = new Map();
const addCandidate = (name, source) => {
  if (!candidates.has(name)) candidates.set(name, new Set());
  candidates.get(name).add(source);
};
for (const node of logNodes.keys()) if (nameOf.has(node)) addCandidate(nameOf.get(node), 'logs');
for (const name of suppliedNames) addCandidate(name, 'supplied');

/** @type {{ name: string, reason: string, sources: string[] }[]} */
const notSeeded = [];
const skip = (name, reason) => notSeeded.push({ name, reason, sources: [...(candidates.get(name) ?? [])].sort() });

const ethCandidates = [];
for (const name of candidates.keys()) {
  const labels = name.split('.');
  if (labels.length < 2 || labels.at(-1) !== 'eth') skip(name, 'not a .eth name');
  else if (!isNormalized(name)) skip(name, 'not ENSIP-15 normalized');
  else ethCandidates.push(name);
}
const ancestorsOf = (name) => {
  const labels = name.split('.');
  const out = [];
  for (let i = 1; i < labels.length - 1; i++) out.push(labels.slice(i).join('.'));
  return out; // parent first, ending at the second-level name
};
const allNames = [...new Set(ethCandidates.flatMap((n) => [n, ...ancestorsOf(n)]))];
const state = await readEnsState(allNames);

/** @type {Map<string, { ensName: string, owner: string, record: string, rules: string[] }>} */
const inUse = new Map();
for (const name of ethCandidates) {
  const s = state.get(name);
  if (s.inactive) skip(name, s.inactive);
  else if (s.recordError) skip(name, s.recordError);
  else if (!s.record) skip(name, `no ${KEY} record at S`);
  else inUse.set(name, { ensName: name, owner: s.holder, record: s.record, rules: ['in use'] });
}

// --- 4. ancestors and reserved names ---

/** @type {Map<string, { ensName: string | null, owner: string | null, record: string, rules: string[] }>} */
const entries = new Map(inUse);
for (const name of inUse.keys()) {
  for (const ancestor of ancestorsOf(name)) {
    if (!entries.has(ancestor)) {
      entries.set(ancestor, { ensName: ancestor, owner: state.get(ancestor).holder, record: '', rules: ['ancestor'] });
    }
  }
}
const reservedInUse = [];
for (const group of reserved.groups) {
  for (const label of group.labels) {
    const ensName = `${label}.eth`;
    if (!isNormalized(ensName)) throw new Error(`reserved label ${label} is not ENSIP-15 normalized`);
    if (entries.has(ensName)) {
      reservedInUse.push(label);
      continue;
    }
    entries.set(ensName, { ensName: null, owner: group.address, record: '', rules: ['reserved'] });
  }
}

// --- 5. what the registry cannot hold ---

const excluded = new Map();
const byDepth = [...entries.keys()].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
for (const name of byDepth) {
  const e = entries.get(name);
  const labels = name.split('.');
  const parent = labels.slice(1).join('.');
  const reason =
    depth(name) > 0 && !entries.has(parent)
      ? 'parent is not in the seed list'
      : depth(name) > 0 && excluded.has(parent)
        ? `parent ${toBso(parent)} is left out`
        : labelProblem(labels[0], depth(name) === 0) ??
          (depth(name) > MAX_SUBDOMAIN_DEPTH ? `more than ${MAX_SUBDOMAIN_DEPTH} levels below its top-level name` : null) ??
          (e.owner && isAddressEqual(e.owner, zeroAddress) ? 'held by the zero address at S' : null);
  if (reason) excluded.set(name, reason);
}
for (const [name, reason] of excluded) {
  if (!entries.get(name).rules.includes('reserved')) skip(name, `left out: ${reason}`);
  else throw new Error(`reserved name ${toBso(name)} is invalid: ${reason}`);
  entries.delete(name);
}

// --- 6. output ---

const seedEntries = [...entries.keys()]
  .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))
  .map((name) => {
    const e = entries.get(name);
    const labels = name.split('.');
    const parentName = depth(name) > 0 ? toBso(labels.slice(1).join('.')) : null;
    return {
      name: toBso(name),
      label: labels[0],
      parent: parentName ? hexToBigInt(namehash(parentName)).toString() : '0',
      parentName,
      owner: e.owner ? getAddress(e.owner) : null,
      record: e.record,
      ensName: e.ensName,
      rules: e.rules,
    };
  });
const seen = new Set();
for (const e of seedEntries) {
  const key = `${e.label}/${e.parent}`;
  if (seen.has(key)) throw new Error(`duplicate (label, parent): ${e.name}`);
  seen.add(key);
}
const missingOwners = seedEntries.filter((e) => !e.owner).map((e) => e.name);
const tree = missingOwners.length
  ? null
  : StandardMerkleTree.of(
      seedEntries.map((e) => [e.label, e.parent, e.owner, e.record]),
      LEAF_ENCODING,
    );

// A candidate without a record of its own can still be seeded as an ancestor.
const notSeededList = notSeeded.filter((n) => !entries.has(n.name)).sort((a, b) => a.name.localeCompare(b.name));
const seedList = {
  bsip: 13,
  snapshot: { block: Number(S), hash: block.hash, timestamp: Number(timestamp) },
  seedRoot: tree?.root ?? null,
  seedCount: seedEntries.length,
  missingOwners,
  leafEncoding: LEAF_ENCODING,
  entries: seedEntries,
  reservedInUse: reservedInUse.sort(),
  notSeeded: notSeededList,
  unmappedNodes: unmapped.map((node) => ({
    node,
    resolvers: [...logNodes.get(node).resolvers].sort(),
    transactions: [...logNodes.get(node).transactions].sort(),
    ...partialInfo(node),
  })),
  inputs: {
    textChangedEvents: textLogs.length,
    eventNodes: logNodes.size,
    suppliedNames: suppliedNames.length,
    suppliedListsCommit: supplied.lists.commit,
  },
};

const outputs = {
  'seed-list.json': JSON.stringify(seedList, null, 2) + '\n',
  'seed-tree.json': tree ? JSON.stringify(tree.dump(), null, 2) + '\n' : null,
};
if (check) {
  const diffs = Object.entries(outputs).filter(([file, text]) => {
    const exists = existsSync(new URL(file, dir));
    return text === null ? exists : !exists || read(file) !== text;
  });
  if (diffs.length) {
    log(`differs from the committed files: ${diffs.map(([f]) => f).join(', ')}`);
    process.exit(1);
  }
  log('rebuild matches seed-list.json and seed-tree.json');
} else {
  for (const [file, text] of Object.entries(outputs)) {
    if (text === null) rmSync(new URL(file, dir), { force: true });
    else writeFileSync(new URL(file, dir), text);
  }
}
log(
  `${seedEntries.length} entries (${seedEntries.filter((e) => e.rules.includes('in use')).length} in use, ` +
    `${seedEntries.filter((e) => e.rules.includes('ancestor')).length} ancestors, ` +
    `${seedEntries.filter((e) => e.rules.includes('reserved')).length} reserved), ` +
    `${notSeededList.length} candidates not seeded, ${unmapped.length} unmapped nodes`,
);
log(tree ? `SEED_ROOT = ${tree.root}` : `no SEED_ROOT yet: owner address missing for ${missingOwners.join(', ')}`);

// --- helpers ---

/** eth_getLogs over [from, to], halving any range the RPC refuses. */
async function getLogs(filter, from, to) {
  try {
    return await client.request({
      method: 'eth_getLogs',
      params: [{ ...filter, fromBlock: toHex(from), toBlock: toHex(to) }],
    });
  } catch (error) {
    if (to <= from) throw error;
    const mid = (from + to) / 2n;
    return [...(await getLogs(filter, from, mid)), ...(await getLogs(filter, mid + 1n, to))];
  }
}

/**
 * Map event nodes to names. A log holds a node, not a name, so this tries, in rounds:
 * NameWrapped events (wrapped names carry their full name), the registry's NewOwner and the
 * registrar's Transfer events in the transactions that set the record, and the registrar's Transfer
 * events to the node's registry owner at S; then it looks up the plaintext of every labelhash found
 * in any event that carries it as its first indexed topic and its first data field.
 */
async function mapNodes(nodes) {
  /** @type {Map<string, string>} labelhash -> label */
  const plaintext = new Map();
  const tried = new Set();
  const scannedParents = new Set();
  let pending = nodes.filter((n) => !nameOf.has(n));
  for (let round = 0; round < 5 && pending.length; round++) {
    pending.forEach((n) => tried.add(n));
    const want = new Set(pending);

    const wrapped = await getLogs({ address: NAME_WRAPPER, topics: [NAME_WRAPPED_TOPIC, pending] }, ENS_FIRST_BLOCK, S);
    for (const l of wrapped) {
      const [dnsName] = decodeAbiParameters(NAME_WRAPPED.inputs.slice(1, 2), l.data);
      const name = decodeDnsName(dnsName);
      if (name && namehash(name) === l.topics[1]) learn(name);
    }

    const txs = new Set(pending.flatMap((n) => [...(logNodes.get(n)?.transactions ?? [])]));
    const receipts = await mapLimit([...txs], 4, (hash) => client.getTransactionReceipt({ hash }));
    const setters = new Map();
    for (const r of receipts) {
      for (const l of r.logs) {
        notePartial(l, want, partial);
        notePlaintext(l, plaintext);
      }
      for (const n of pending) if (logNodes.get(n)?.transactions.has(r.transactionHash)) setters.set(n, r.from);
    }

    // Subnames created before their record was set: NewOwner events under every known name.
    const parentsToScan = [...nameOf.keys()].filter((n) => n !== ETH_NODE && !scannedParents.has(n));
    parentsToScan.forEach((n) => scannedParents.add(n));
    for (let i = 0; i < parentsToScan.length; i += 50) {
      const created = await getLogs(
        { address: [ENS_REGISTRY, ENS_OLD_REGISTRY], topics: [NEW_OWNER, parentsToScan.slice(i, i + 50)] },
        ENS_FIRST_BLOCK,
        S,
      );
      created.forEach((l) => notePartial(l, want, partial));
    }

    const needOwner = pending.filter((n) => !nameOf.has(n) && !partial.has(n));
    if (needOwner.length) {
      const owners = await client.multicall({
        contracts: needOwner.map((node) => ({ address: ENS_REGISTRY, abi: registryAbi, functionName: 'owner', args: [node] })),
        blockNumber: S,
        allowFailure: true,
        batchSize: 16_384,
      });
      const accounts = new Set();
      needOwner.forEach((n, i) => {
        const owner = owners[i].status === 'success' ? owners[i].result : zeroAddress;
        for (const a of [owner, setters.get(n)]) {
          if (a && !isAddressEqual(a, zeroAddress) && !isAddressEqual(a, NAME_WRAPPER)) accounts.add(getAddress(a));
        }
      });
      // The account's .eth names: either the node itself, or a parent of it to scan for NewOwner.
      const accountNames = new Set();
      for (const account of accounts) {
        const transfers = await getLogs(
          { address: BASE_REGISTRAR, topics: [TRANSFER, null, toHex(BigInt(account), { size: 32 })] },
          ENS_FIRST_BLOCK,
          S,
        );
        for (const l of transfers) {
          notePartial(l, want, partial);
          const node = keccak256(concat([ETH_NODE, l.topics[3]]));
          if (!nameOf.has(node) && !scannedParents.has(node)) {
            accountNames.add(node);
            partial.set(node, { parent: ETH_NODE, labelhash: l.topics[3] });
          }
        }
      }
      const accountParents = [...accountNames];
      accountParents.forEach((n) => scannedParents.add(n));
      for (let i = 0; i < accountParents.length; i += 50) {
        const created = await getLogs(
          { address: [ENS_REGISTRY, ENS_OLD_REGISTRY], topics: [NEW_OWNER, accountParents.slice(i, i + 50)] },
          ENS_FIRST_BLOCK,
          S,
        );
        created.forEach((l) => notePartial(l, want, partial));
      }
    }

    const unknownLabels = [...new Set([...partial.values()].map((p) => p.labelhash))].filter((h) => !plaintext.has(h));
    for (let i = 0; i < unknownLabels.length; i += 50) {
      const found = await getLogs({ topics: [null, unknownLabels.slice(i, i + 50)] }, ENS_FIRST_BLOCK, S);
      found.forEach((l) => notePlaintext(l, plaintext));
    }

    // Assemble names whose parent is known; parents still unknown are mapped in the next round.
    for (let changed = true; changed; ) {
      changed = false;
      for (const [node, p] of partial) {
        if (!nameOf.has(node) && nameOf.has(p.parent) && plaintext.has(p.labelhash)) {
          nameOf.set(node, `${plaintext.get(p.labelhash)}.${nameOf.get(p.parent)}`);
          changed = true;
        }
      }
    }
    pending = [...new Set([...partial.values()].map((p) => p.parent))].filter((n) => !nameOf.has(n) && !tried.has(n));
  }
}

/** Record (parent, labelhash) for a wanted node from a NewOwner or registrar Transfer event. */
function notePartial(l, want, partial) {
  if (l.topics[0] === NEW_OWNER && [ENS_REGISTRY, ENS_OLD_REGISTRY].some((a) => isAddressEqual(a, l.address))) {
    const [, parent, label] = l.topics;
    const child = keccak256(concat([parent, label]));
    if (want.has(child)) partial.set(child, { parent, labelhash: label });
  } else if (l.topics[0] === TRANSFER && isAddressEqual(l.address, BASE_REGISTRAR) && l.topics.length === 4) {
    const label = l.topics[3];
    const child = keccak256(concat([ETH_NODE, label]));
    if (want.has(child)) partial.set(child, { parent: ETH_NODE, labelhash: label });
  }
}

/** Take a label's plaintext from an event whose first indexed topic is its labelhash and whose first
 * data field is a string, such as a .eth registrar controller's NameRegistered or NameRenewed. */
function notePlaintext(l, plaintext) {
  const hash = l.topics[1];
  if (!hash || plaintext.has(hash) || l.data.length < 2 + 128) return;
  try {
    const [label] = decodeAbiParameters([{ type: 'string' }], l.data);
    if (label && keccak256(toHex(label)) === hash) plaintext.set(hash, label);
  } catch {}
}

/** What is known about an unmapped node: its labelhash and its parent's name or node. */
function partialInfo(node) {
  const p = partial.get(node);
  if (!p) return {};
  return { labelhash: p.labelhash, parent: nameOf.get(p.parent) ?? p.parent };
}

/**
 * Read each .eth name's holder, resolver and record at S. Names under a second-level name that was
 * migrated to ENSv2 (its v1 registry owner is the migration Graveyard), or that v1 does not hold,
 * are read from the ENSv2 registries; all others from the v1 registry, BaseRegistrar and NameWrapper.
 */
async function readEnsState(names) {
  const state = await readV1(names);
  const secondLevelOf = (name) => name.split('.').slice(-2).join('.');
  const inV2 = names.filter((name) => {
    const top = state.get(secondLevelOf(name));
    return isReadFromV2(top);
  });
  await mapLimit(inV2, 4, async (name) => state.set(name, await readV2(client, S, name)));

  // Records: the name's own resolver, cross-checked with the Universal Resolver that BSIP-10 clients
  // use. A name without its own resolver (unset, or a wildcard or offchain record) is not seeded, and
  // a disagreement is reported for manual review.
  const withResolver = names.filter((n) => !isAddressEqual(state.get(n).resolver, zeroAddress));
  const texts = await client.multicall({
    contracts: withResolver.map((n) => ({
      address: state.get(n).resolver,
      abi: resolverAbi,
      functionName: 'text',
      args: [state.get(n).node, KEY],
    })),
    blockNumber: S,
    allowFailure: true,
    batchSize: 16_384,
  });
  withResolver.forEach((n, i) => {
    if (texts[i].status === 'success') state.get(n).record = texts[i].result;
  });
  // Some resolvers, such as those ENSv2 migration set, answer only through ENSIP-10 resolve(). With
  // ccipRead off, an offchain (EIP-3668) answer reverts here and the name is not seeded.
  const viaResolve = withResolver.filter((n, i) => texts[i].status !== 'success');
  await mapLimit(viaResolve, 2, async (n) => {
    const s = state.get(n);
    const call = encodeFunctionData({ abi: resolverAbi, functionName: 'text', args: [s.node, KEY] });
    const answer = await retry(() =>
      client.readContract({ address: s.resolver, abi: extendedResolverAbi, functionName: 'resolve', args: [dnsEncode(n), call], blockNumber: S }),
    );
    if (answer === undefined) s.recordError = 'its resolver reverted on text() and resolve() at S (offchain resolver?)';
    else s.record = decodeFunctionResult({ abi: resolverAbi, functionName: 'text', data: answer });
  });
  await mapLimit(names, 2, async (name) => {
    const s = state.get(name);
    if (s.inactive) return;
    const universal = await retry(async () => (await client.getEnsText({ name, key: KEY, blockNumber: S, strict: true })) ?? '');
    if (universal === undefined) s.recordError ??= 'the Universal Resolver call failed at S: needs manual review';
    else if (isAddressEqual(s.resolver, zeroAddress)) {
      if (universal) s.recordError = 'has no resolver of its own but resolves through the Universal Resolver (wildcard?): needs manual review';
    } else if (!s.recordError && universal !== (s.record ?? '')) {
      s.recordError = `the Universal Resolver returns ${JSON.stringify(universal)}: needs manual review`;
    }
  });
  return state;
}

/** ENSv1: registry owner and resolver, registrar expiry and registrant, NameWrapper holder. */
async function readV1(names) {
  const calls = names.flatMap((name) => {
    const node = namehash(name);
    const id = hexToBigInt(labelhash(name.split('.')[0]));
    const secondLevel = name.split('.').length === 2;
    return [
      { address: ENS_REGISTRY, abi: registryAbi, functionName: 'owner', args: [node] },
      { address: ENS_REGISTRY, abi: registryAbi, functionName: 'resolver', args: [node] },
      { address: NAME_WRAPPER, abi: registrarAbi, functionName: 'ownerOf', args: [hexToBigInt(node)] },
      secondLevel
        ? { address: BASE_REGISTRAR, abi: registrarAbi, functionName: 'nameExpires', args: [id] }
        : { address: ENS_REGISTRY, abi: registryAbi, functionName: 'owner', args: [node] },
      secondLevel
        ? { address: BASE_REGISTRAR, abi: registrarAbi, functionName: 'ownerOf', args: [id] }
        : { address: ENS_REGISTRY, abi: registryAbi, functionName: 'owner', args: [node] },
    ];
  });
  const results = await client.multicall({ contracts: calls, blockNumber: S, allowFailure: true, batchSize: 16_384 });
  const value = (r) => (r.status === 'success' ? r.result : undefined);

  const state = new Map();
  names.forEach((name, i) => {
    const [owner, resolver, wrappedOwner, expires, registrant] = results.slice(i * 5, i * 5 + 5).map(value);
    const secondLevel = name.split('.').length === 2;
    const wrapped = owner && isAddressEqual(owner, NAME_WRAPPER);
    const pastGrace = secondLevel && timestamp > /** @type {bigint} */ (expires ?? 0n) + ENS_GRACE_PERIOD;
    // A second-level name's holder is its registrant or the holder of the wrapped name; a subname's
    // is its registry owner or the holder of the wrapped name. NameWrapper returns 0 once expired.
    let holder = wrapped ? (wrappedOwner ?? zeroAddress) : secondLevel ? (registrant ?? null) : (owner ?? zeroAddress);
    if (pastGrace) holder = zeroAddress;
    state.set(name, {
      ens: 'v1',
      node: namehash(name),
      registryOwner: owner ?? zeroAddress,
      resolver: resolver ?? zeroAddress,
      holder,
      inactive: pastGrace ? 'expired past the ENS v1 grace period at S' : null,
    });
  });

  // A registrant in its grace period: ERC-721 ownerOf reverts, so take the last Transfer up to S.
  for (const [name, s] of state) {
    if (s.holder !== null) continue;
    const id = labelhash(name.split('.')[0]);
    const transfers = await getLogs({ address: BASE_REGISTRAR, topics: [TRANSFER, null, null, id] }, ENS_FIRST_BLOCK, S);
    const last = transfers.at(-1);
    s.holder = last ? getAddress(`0x${last.topics[2].slice(26)}`) : zeroAddress;
  }
  return state;
}

function dnsEncode(name) {
  const labels = name.split('.').map((l) => Buffer.from(l, 'utf8'));
  return toHex(Buffer.concat([...labels.flatMap((l) => [Buffer.from([l.length]), l]), Buffer.from([0])]));
}

function decodeDnsName(hex) {
  const bytes = Buffer.from(hex.slice(2), 'hex');
  const labels = [];
  let i = 0;
  while (i < bytes.length && bytes[i] !== 0) {
    const len = bytes[i];
    labels.push(bytes.subarray(i + 1, i + 1 + len).toString('utf8'));
    i += len + 1;
  }
  return labels.length ? labels.join('.') : null;
}

function isNormalized(name) {
  try {
    return ens_normalize(name) === name;
  } catch {
    return false;
  }
}

function normalizeOrKeep(name) {
  try {
    return ens_normalize(name);
  } catch {
    return name;
  }
}

/** The registry's label rules (upstream _validateAndNormalize and BSIP-13 change 5). */
function labelProblem(label, topLevel) {
  if (!label.isWellFormed()) return 'label is not valid UTF-8';
  const size = Buffer.byteLength(label, 'utf8');
  if (size < 1 || size > 255) return 'label is not 1 to 255 bytes';
  if (/[\u0000- .\u007f]/.test(label)) return 'label contains a control character, space, "." or DEL';
  if (label.startsWith('-') || label.endsWith('-')) return 'label starts or ends with "-"';
  if (label !== label.replace(/[A-Z]/g, (c) => c.toLowerCase())) return 'label has uppercase ASCII';
  if (topLevel && [...label].length < MIN_TOP_LEVEL_CODE_POINTS) return `top-level label shorter than ${MIN_TOP_LEVEL_CODE_POINTS} characters`;
  return null;
}

/** Levels below the top-level name: memes.bso is 0, a.memes.bso is 1. */
function depth(ethName) {
  return ethName.split('.').length - 2;
}

function toEth(name) {
  return name.toLowerCase().endsWith('.bso') ? `${name.slice(0, -4)}.eth` : name;
}

function toBso(name) {
  return name.endsWith('.eth') ? `${name.slice(0, -4)}.bso` : name;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** Fail if reserved.json and BSIP-13's reserved-name table or fee recipient disagree. */
function checkReservedAgainstBsip(file) {
  const bsip = readFileSync(new URL('../../BSIPS/bsip-13.md', dir), 'utf8');
  const fee = bsip.match(/\| Fee recipient \| Safe multisig `(0x[0-9a-fA-F]{40})` \|/)?.[1];
  if (!fee || !isAddressEqual(fee, file.feeRecipient)) throw new Error('reserved.json feeRecipient differs from BSIP-13');
  const table = bsip.split('Proposed reserved names:')[1]?.split('\n\n')[1] ?? '';
  const fromBsip = new Map();
  for (const row of table.split('\n').slice(2)) {
    const [labelsCell, ownerCell] = row.split('|').slice(1, 3);
    const address = ownerCell.includes('fee recipient') ? file.feeRecipient : (ownerCell.match(/0x[0-9a-fA-F]{40}/)?.[0] ?? null);
    for (const [, label] of labelsCell.matchAll(/`([^`]+)`/g)) fromBsip.set(label, address);
  }
  const fromFile = new Map(file.groups.flatMap((g) => g.labels.map((l) => [l, g.address])));
  const same =
    fromBsip.size === fromFile.size &&
    [...fromBsip].every(([l, a]) => fromFile.has(l) && (a === null ? fromFile.get(l) === null : fromFile.get(l) !== null && isAddressEqual(a, fromFile.get(l))));
  if (!same) throw new Error('reserved.json differs from the reserved-name table in BSIP-13');
}
