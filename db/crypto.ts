const ENVELOPE_PREFIX = 'enc:v1:';
const CREDENTIAL_FIELDS = new Set(['password', 'passwordHash', 'salt', 'password_hash', 'passwordSalt']);

function bytesToBase64(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !CREDENTIAL_FIELDS.has(key))
      .map(([key, item]) => [key, sanitizeValue(item)]),
  );
}

export function sanitizeCrmPayload(payload: Record<string, string>) {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    try {
      clean[key] = JSON.stringify(sanitizeValue(JSON.parse(value)));
    } catch {
      clean[key] = value;
    }
  }
  return clean;
}

async function encryptionKey() {
  const encoded = process.env.CRM_DATA_ENCRYPTION_KEY;
  if (!encoded) throw new Error('CRM_DATA_ENCRYPTION_KEY is not configured');
  const raw = base64ToBytes(encoded);
  if (raw.byteLength !== 32) throw new Error('CRM_DATA_ENCRYPTION_KEY must contain exactly 32 bytes');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function isEncrypted(value: string) {
  return value.startsWith(ENVELOPE_PREFIX);
}

export async function encryptText(plainText: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(plainText)));
  const envelope = new Uint8Array(iv.byteLength + cipher.byteLength);
  envelope.set(iv);
  envelope.set(cipher, iv.byteLength);
  return ENVELOPE_PREFIX + bytesToBase64(envelope);
}

export async function decryptText(value: string) {
  if (!isEncrypted(value)) return value;
  const envelope = base64ToBytes(value.slice(ENVELOPE_PREFIX.length));
  const iv = envelope.slice(0, 12);
  const cipher = envelope.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await encryptionKey(), cipher);
  return new TextDecoder().decode(plain);
}

export async function encryptPayload(payload: Record<string, string>) {
  return encryptText(JSON.stringify(sanitizeCrmPayload(payload)));
}

export async function decryptPayload(value: string) {
  const decoded = JSON.parse(await decryptText(value)) as Record<string, string>;
  return sanitizeCrmPayload(decoded);
}
