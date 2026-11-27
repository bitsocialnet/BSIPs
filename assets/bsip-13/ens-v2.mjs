// How the seed-list builder decides that a .eth name lives in ENSv2, and how it reads one there.
// Kept apart from build-seed-list.mjs so that it can be tested without running the builder.

import { hexToBigInt, isAddressEqual, labelhash, namehash, parseAbi, zeroAddress } from 'viem';

// ENSv2 (live since 2026-10-28): migrated v1 names are owned by the Graveyard in the v1 registry and
// live in the v2 registries, starting from the ETH registry.
export const GRAVEYARD = '0xDa021A2C1C2F99574D861Ef8c6fA745851BEB7F6';
export const ETH_REGISTRY_V2 = '0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2';
export const V2_REGISTERED = 2; // IPermissionedRegistry.Status

export const v2RegistryAbi = parseAbi([
  'function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource))',
  'function getResolver(string label) view returns (address)',
  'function getSubregistry(string label) view returns (address)',
]);

/**
 * Whether a name is read from ENSv2, given the ENSv1 state of its second-level name: when that name
 * was migrated (its v1 registry owner is the migration Graveyard), or when v1 does not hold it.
 */
export function isReadFromV2(secondLevelV1State) {
  return Boolean(secondLevelV1State.inactive) || isAddressEqual(secondLevelV1State.registryOwner, GRAVEYARD);
}

/** Call fn up to 3 times; undefined if every attempt fails. */
export async function retry(fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return undefined;
}

/**
 * ENSv2: walk the registries from the ETH registry down the name's labels. A name is registered when
 * its registry reports REGISTERED and so does the registry of every name above it; v2 registries
 * stop resolving a name at expiry, and its grace period only allows renewal, so an expired v2 name
 * does not resolve, and neither does anything under it.
 *
 * `blockNumber` is the block to read at (undefined for the latest). `attempt` wraps each call and
 * returns undefined when it fails.
 */
export async function readV2(client, blockNumber, name, attempt = retry) {
  const labels = name.split('.').slice(0, -1).reverse();
  const out = { ens: 'v2', node: namehash(name), resolver: zeroAddress, holder: zeroAddress, inactive: null };
  let registry = ETH_REGISTRY_V2;
  for (const [i, label] of labels.entries()) {
    const read = (functionName, args) =>
      attempt(() => client.readContract({ address: registry, abi: v2RegistryAbi, functionName, args, blockNumber }));
    const [st, resolver, subregistry] = await Promise.all([
      read('getState', [hexToBigInt(labelhash(label))]),
      read('getResolver', [label]),
      read('getSubregistry', [label]),
    ]);
    if (st === undefined || resolver === undefined || subregistry === undefined) {
      out.inactive = 'could not read its ENSv2 registry at S: needs manual review';
      return out;
    }
    if (st.status !== V2_REGISTERED) {
      out.inactive = `not registered in ENS at S (ENSv2 ${labels.slice(0, i + 1).reverse().join('.')}.eth is not registered)`;
      return out;
    }
    if (i === labels.length - 1) {
      out.holder = st.latestOwner;
      out.resolver = resolver;
    } else if (isAddressEqual(subregistry, zeroAddress)) {
      out.inactive = 'not registered in ENS at S (no ENSv2 subregistry)';
      return out;
    }
    registry = subregistry;
  }
  return out;
}
