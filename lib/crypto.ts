import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Stateless token crypto.
 *
 * Every artifact this server hands out (client IDs, authorization codes,
 * access tokens, refresh tokens, consent-request blobs) is an AES-256-GCM
 * sealed JSON payload. Nothing is persisted server-side — the AUTH_SECRET
 * env var is the only state. GCM gives confidentiality + integrity, so
 * tampered or foreign tokens simply fail to open.
 */

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET env var must be set to a random string of 16+ chars. Generate one with: openssl rand -hex 32"
    );
  }
  return createHash("sha256").update(secret).digest();
}

const IV_LEN = 12;
const TAG_LEN = 16;

/** Seal a JSON payload into an opaque base64url token. */
export function seal(payload: Record<string, unknown>): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

/** Open a sealed token. Returns null on any tamper/parse/format failure. */
export function open<T = Record<string, unknown>>(token: string): T | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < IV_LEN + TAG_LEN + 1) return null;
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** SHA-256 → base64url, as used by PKCE S256 (RFC 7636). */
export function sha256base64url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
