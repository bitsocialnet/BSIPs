// @ts-check
// Check the BSIP test vectors in this directory with Node built-ins only, independently of pkc-js:
// test keys and addresses, the CBOR signing bytes and Ed25519 signatures (BSIP-2, BSIP-4), comment
// CIDs (BSIP-2), and the ed25519-aes-gcm encryption of a challenge request (BSIP-4). The `pkcJs`
// fields record what pkc-js returned when the vectors were generated and are not re-checked here.
//
// Usage: node assets/verify-vectors.mjs
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const load = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const fromHex = (h) => Buffer.from(h, 'hex');
const hex = (bytes) => Buffer.from(bytes).toString('hex');

const failures = [];
let checks = 0;
const check = (label, ok) => {
  checks++;
  if (!ok) failures.push(label);
};

// JSON stand-in for a CBOR byte string: { "bytesHex": "..." }
const revive = (v) => {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === 'bytesHex') return fromHex(v.bytesHex);
    return Object.fromEntries(keys.map((k) => [k, revive(v[k])]));
  }
  return v;
};

// --- keys and addresses ---

const ED25519_PKCS8 = fromHex('302e020100300506032b657004220420');
const ED25519_SPKI = fromHex('302a300506032b6570032100');
const X25519_PKCS8 = fromHex('302e020100300506032b656e04220420');
const X25519_SPKI = fromHex('302a300506032b656e032100');
const privateKey = (prefix, raw) => crypto.createPrivateKey({ key: Buffer.concat([prefix, raw]), format: 'der', type: 'pkcs8' });
const publicKey = (prefix, raw) => crypto.createPublicKey({ key: Buffer.concat([prefix, raw]), format: 'der', type: 'spki' });
const rawPublicKey = (key) => crypto.createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32);

const ed25519PublicKey = (seed) => rawPublicKey(privateKey(ED25519_PKCS8, seed));
const ed25519Verify = (message, signature, pub) => {
  try {
    return crypto.verify(null, message, publicKey(ED25519_SPKI, pub), signature);
  } catch {
    return false;
  }
};

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const base58btc = (bytes) => {
  let n = BigInt('0x' + (hex(bytes) || '0'));
  let out = '';
  for (; n > 0n; n /= 58n) out = B58[Number(n % 58n)] + out;
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
};

// libp2p PeerId of an Ed25519 key: identity multihash of the protobuf public key (BSIP-10, BSIP-4).
const peerIdBytes = (pub) => Buffer.concat([fromHex('002408011220'), pub]);

const checkKey = (label, key) => {
  const pub = ed25519PublicKey(fromHex(key.privateKeyHex));
  check(`${label}: privateKeyBase64`, Buffer.from(key.privateKeyBase64, 'base64').equals(fromHex(key.privateKeyHex)));
  check(`${label}: publicKeyHex`, hex(pub) === key.publicKeyHex);
  check(`${label}: publicKeyBase64`, Buffer.from(key.publicKeyBase64, 'base64').equals(pub));
  check(`${label}: address`, base58btc(peerIdBytes(pub)) === key.address);
};

// --- CBOR, as cborg encodes with pkc-js's options ---

// Exact IEEE 754 half-precision bits of x, or undefined when x is not exactly representable.
const float16Bits = (x) => {
  if (Number.isNaN(x)) return 0x7e00;
  const sign = x < 0 || Object.is(x, -0) ? 0x8000 : 0;
  const a = Math.abs(x);
  if (a === Infinity) return sign | 0x7c00;
  if (a === 0) return sign;
  const e = Math.floor(Math.log2(a));
  if (e > 15) return undefined;
  const mantissa = e >= -14 ? (a / 2 ** e - 1) * 1024 : a / 2 ** -24;
  if (!Number.isInteger(mantissa) || mantissa < 0 || mantissa >= 1024) return undefined;
  return sign | (e >= -14 ? (e + 15) << 10 : 0) | mantissa;
};

const utf8Compare = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length - y.length || Buffer.compare(x, y);
};

const cbor = (value) => {
  const parts = [];
  const head = (major, n) => {
    const big = BigInt(n);
    if (big < 24n) parts.push(Buffer.from([(major << 5) | Number(big)]));
    else if (big < 0x100n) parts.push(Buffer.from([(major << 5) | 24, Number(big)]));
    else if (big < 0x10000n) parts.push(Buffer.from([(major << 5) | 25]), Buffer.from([Number(big >> 8n), Number(big & 0xffn)]));
    else if (big < 0x100000000n) {
      const b = Buffer.alloc(5);
      b[0] = (major << 5) | 26;
      b.writeUInt32BE(Number(big), 1);
      parts.push(b);
    } else {
      const b = Buffer.alloc(9);
      b[0] = (major << 5) | 27;
      b.writeBigUInt64BE(big, 1);
      parts.push(b);
    }
  };
  const encode = (v) => {
    if (v === null) parts.push(Buffer.from([0xf6]));
    else if (v === true) parts.push(Buffer.from([0xf5]));
    else if (v === false) parts.push(Buffer.from([0xf4]));
    else if (typeof v === 'number') {
      // Safe integers (and -0) are CBOR integers; anything else is the shortest exact float.
      if (Number.isSafeInteger(v)) v >= 0 ? head(0, v) : head(1, -1 - v);
      else if (float16Bits(v) !== undefined) parts.push(Buffer.from([0xf9, float16Bits(v) >> 8, float16Bits(v) & 0xff]));
      else if (Math.fround(v) === v) {
        const b = Buffer.alloc(5);
        b[0] = 0xfa;
        b.writeFloatBE(v, 1);
        parts.push(b);
      } else {
        const b = Buffer.alloc(9);
        b[0] = 0xfb;
        b.writeDoubleBE(v, 1);
        parts.push(b);
      }
    } else if (typeof v === 'string') {
      const bytes = Buffer.from(v, 'utf8');
      head(3, bytes.length);
      parts.push(bytes);
    } else if (v instanceof Uint8Array) {
      head(2, v.length);
      parts.push(Buffer.from(v));
    } else if (Array.isArray(v)) {
      head(4, v.length);
      v.forEach(encode);
    } else if (typeof v === 'object') {
      // Map keys sorted shortest first, then bytewise (RFC 7049 canonical).
      const keys = Object.keys(v).sort(utf8Compare);
      head(5, keys.length);
      for (const k of keys) {
        encode(k);
        encode(v[k]);
      }
    } else throw new Error(`cannot encode ${typeof v}`);
  };
  encode(value);
  return Buffer.concat(parts);
};

// The bytes a signature covers (BSIP-2, Signatures): the listed properties that are present and not null.
const signedBytes = (record, signedPropertyNames) =>
  cbor(Object.fromEntries(signedPropertyNames.filter((n) => record[n] !== undefined && record[n] !== null).map((n) => [n, record[n]])));

// --- BSIP-2 signatures ---

const signatures = load('./bsip-2/signature-vectors.json');
signatures.testOnlyKeys.forEach((key) => checkKey(`signature key ${key.label}`, key));
for (const v of signatures.vectors) {
  if (v.examples) {
    for (const e of v.examples) check(`cbor ${JSON.stringify(e.value)}`, hex(cbor(revive(e.value))) === e.cborHex);
    continue;
  }
  const label = `signature ${v.name}`;
  const { signature } = v.object;
  check(`${label}: key`, ed25519PublicKey(fromHex(v.privateKeyHex)).equals(Buffer.from(v.publicKeyBase64, 'base64')));
  check(`${label}: signedPropertyNames`, JSON.stringify(signature.signedPropertyNames) === JSON.stringify(v.signedPropertyNames));
  check(`${label}: signedCborHex`, hex(signedBytes(v.object, signature.signedPropertyNames)) === v.signedCborHex);
  const valid = ed25519Verify(
    fromHex(v.signedCborHex),
    Buffer.from(signature.signature, 'base64'),
    Buffer.from(signature.publicKey, 'base64'),
  );
  check(`${label}: signature valid = ${v.pkcJs.signatureOnly.valid}`, valid === v.pkcJs.signatureOnly.valid);
  if (v.pkcJs.signedByPkcJsHex) {
    const signedBy = fromHex(v.pkcJs.signedByPkcJsHex);
    check(`${label}: signedByPkcJsHex signature`, ed25519Verify(signedBy, Buffer.from(signature.signature, 'base64'), Buffer.from(signature.publicKey, 'base64')));
  }
}

// --- BSIP-2 CIDs ---

// safe-stable-stringify: JSON.stringify with every object's keys sorted by UTF-16 code units.
const stableStringify = (v) => {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableStringify(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(v);
};
const varint = (n) => {
  const out = [];
  for (; n >= 0x80; n = Math.floor(n / 128)) out.push((n % 128) | 0x80);
  out.push(n);
  return Buffer.from(out);
};

const cids = load('./bsip-2/cid-vectors.json');
for (const v of cids.vectors) {
  const label = `cid ${v.name}`;
  const json = stableStringify(v.record);
  const bytes = Buffer.from(json, 'utf8');
  const n = bytes.length;
  // Single-chunk UnixFS file in dag-pb (BSIP-2, Addressing and fetching).
  const inner = Buffer.concat([fromHex('080212'), varint(n), bytes, fromHex('18'), varint(n)]);
  const prefix = Buffer.concat([fromHex('0a'), varint(inner.length), fromHex('080212'), varint(n)]);
  const suffix = Buffer.concat([fromHex('18'), varint(n)]);
  const sha = crypto.createHash('sha256').update(Buffer.concat([prefix, bytes, suffix])).digest();
  check(`${label}: deterministicJson`, json === v.deterministicJson);
  check(`${label}: utf8ByteLength`, n === v.utf8ByteLength && n <= 262144);
  check(`${label}: blockPrefixHex`, hex(prefix) === v.blockPrefixHex);
  check(`${label}: blockSuffixHex`, hex(suffix) === v.blockSuffixHex);
  check(`${label}: blockSha256Hex`, hex(sha) === v.blockSha256Hex);
  check(`${label}: cidV0`, base58btc(Buffer.concat([fromHex('1220'), sha])) === v.cidV0);
}

// --- BSIP-4 encryption ---

const P = 2n ** 255n - 19n;
const modPow = (b, e) => {
  let r = 1n;
  for (b %= P; e > 0n; e >>= 1n, b = (b * b) % P) if (e & 1n) r = (r * b) % P;
  return r;
};
const littleEndian = (bytes) => BigInt('0x' + (hex(Buffer.from(bytes).reverse()) || '0'));
const toLittleEndian32 = (n) => Buffer.from(n.toString(16).padStart(64, '0'), 'hex').reverse();
// Ed25519 public key to X25519: u = (1 + y) / (1 - y) mod p.
const montgomeryPublicKey = (edPub) => {
  const y = littleEndian(edPub) & ((1n << 255n) - 1n);
  return toLittleEndian32((((1n + y) % P) * modPow((1n - y + P) % P, P - 2n)) % P);
};
// Ed25519 secret key to X25519: the clamped first half of SHA-512(seed).
const montgomerySecret = (seed) => {
  const s = crypto.createHash('sha512').update(seed).digest().subarray(0, 32);
  s[0] &= 248;
  s[31] &= 127;
  s[31] |= 64;
  return s;
};
const aesGcm = (decrypt, key, iv, data, tag) => {
  const cipher = decrypt ? crypto.createDecipheriv('aes-128-gcm', key, iv) : crypto.createCipheriv('aes-128-gcm', key, iv);
  if (decrypt) cipher.setAuthTag(tag);
  const out = Buffer.concat([cipher.update(data), cipher.final()]);
  return decrypt ? out : { ciphertext: out, tag: cipher.getAuthTag() };
};
const decrypts = (key, iv, ciphertext, tag) => {
  try {
    return aesGcm(true, key, iv, ciphertext, tag);
  } catch {
    return undefined;
  }
};

const encryption = load('./bsip-4/encryption-vectors.json');
encryption.testOnlyKeys.forEach((key) => checkKey(`encryption key ${key.label}`, key));
const payload = encryption.vectors.find((v) => !v.negative);
{
  const v = payload;
  const label = `encryption ${v.name}`;
  checkKey(`${label}: sender`, v.sender);
  checkKey(`${label}: recipient`, v.recipient);
  for (const [who, key] of [['sender', v.sender], ['recipient', v.recipient]]) {
    const secret = montgomerySecret(fromHex(key.privateKeyHex));
    check(`${label}: ${who} X25519 private key`, hex(secret) === v[`${who}X25519PrivateKeyHex`]);
    check(`${label}: ${who} X25519 public key`, hex(rawPublicKey(privateKey(X25519_PKCS8, secret))) === v[`${who}X25519PublicKeyHex`]);
    check(`${label}: ${who} Montgomery public key`, hex(montgomeryPublicKey(fromHex(key.publicKeyHex))) === v[`${who}X25519PublicKeyHex`]);
  }
  const shared = (priv, pub) =>
    crypto.diffieHellman({ privateKey: privateKey(X25519_PKCS8, fromHex(priv)), publicKey: publicKey(X25519_SPKI, fromHex(pub)) });
  check(`${label}: shared secret (sender)`, hex(shared(v.senderX25519PrivateKeyHex, v.recipientX25519PublicKeyHex)) === v.sharedSecretHex);
  check(`${label}: shared secret (recipient)`, hex(shared(v.recipientX25519PrivateKeyHex, v.senderX25519PublicKeyHex)) === v.sharedSecretHex);
  check(`${label}: AES key`, v.aesKeyHex === v.sharedSecretHex.slice(0, 32));
  const plaintext = Buffer.from(v.plaintextJson + ' '.repeat(v.paddingLength), 'utf8');
  check(`${label}: plaintext with padding`, hex(plaintext) === v.plaintextWithPaddingHex);
  const { ciphertext, tag } = aesGcm(false, fromHex(v.aesKeyHex), fromHex(v.ivHex), plaintext);
  check(`${label}: ciphertext`, hex(ciphertext) === v.ciphertextHex);
  check(`${label}: tag`, hex(tag) === v.tagHex);
}
for (const v of encryption.vectors.filter((x) => x.negative)) {
  const opened = decrypts(fromHex(payload.aesKeyHex), fromHex(payload.ivHex), fromHex(v.ciphertextHex ?? payload.ciphertextHex), fromHex(v.tagHex ?? payload.tagHex));
  check(`encryption ${v.name}: decryption accepted = ${v.pkcJs.decryptEd25519AesGcm.accepted}`, (opened !== undefined) === v.pkcJs.decryptEd25519AesGcm.accepted);
}

// --- BSIP-4 challenge request envelope ---

const pubsub = load('./bsip-4/pubsub-signature-vectors.json');
pubsub.testOnlyKeys.forEach((key) => checkKey(`pubsub key ${key.label}`, key));
const request = pubsub.vectors.find((v) => !v.negative);
const requestMessage = revive(request.message);
{
  const v = request;
  const label = `pubsub ${v.name}`;
  const message = requestMessage;
  checkKey(`${label}: signer`, v.signerKey);
  check(`${label}: signature.publicKey`, hex(message.signature.publicKey) === v.signaturePublicKeyHex && v.signaturePublicKeyHex === v.signerKey.publicKeyHex);
  check(`${label}: signature.signature`, hex(message.signature.signature) === v.signatureHex);
  check(`${label}: signedPropertyNames`, JSON.stringify(message.signature.signedPropertyNames) === JSON.stringify(v.signedPropertyNames));
  check(`${label}: signedCborHex`, hex(signedBytes(message, v.signedPropertyNames)) === v.signedCborHex);
  check(`${label}: signature valid = ${v.pkcJs.verifyChallengeRequest.valid}`, ed25519Verify(fromHex(v.signedCborHex), fromHex(v.signatureHex), fromHex(v.signaturePublicKeyHex)) === v.pkcJs.verifyChallengeRequest.valid);
  const id = peerIdBytes(fromHex(v.signaturePublicKeyHex));
  check(`${label}: challengeRequestId`, hex(id) === v.challengeRequestId.hex && hex(message.challengeRequestId) === v.challengeRequestId.hex && base58btc(id) === v.challengeRequestId.base58btc);
  check(`${label}: wireMessageCborHex`, hex(cbor(message)) === v.wireMessageCborHex);
  check(
    `${label}: encrypted matches ${v.encryptedFrom}`,
    hex(message.encrypted.ciphertext) === payload.ciphertextHex && hex(message.encrypted.iv) === payload.ivHex && hex(message.encrypted.tag) === payload.tagHex,
  );
}
for (const v of pubsub.vectors.filter((x) => x.negative)) {
  const message = { ...requestMessage };
  if (v.challengeRequestIdHex) message.challengeRequestId = fromHex(v.challengeRequestIdHex);
  if (v.timestamp !== undefined) message.timestamp = v.timestamp;
  const idDerived = Buffer.from(message.challengeRequestId).equals(peerIdBytes(message.signature.publicKey));
  const signatureValid = ed25519Verify(signedBytes(message, message.signature.signedPropertyNames), message.signature.signature, message.signature.publicKey);
  check(`pubsub ${v.name}: valid = ${v.pkcJs.verifyChallengeRequest.valid}`, (idDerived && signatureValid) === v.pkcJs.verifyChallengeRequest.valid);
}

if (failures.length) {
  console.error(`${failures.length} of ${checks} vector checks failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`All ${checks} vector checks passed.`);
