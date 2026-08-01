const encoder = new TextEncoder();

function encode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return new Uint8Array([...binary].map((character) => character.charCodeAt(0)));
}

async function signature(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

export async function createDesktopSession(userId: string, secret: string, lifetimeMs = 60_000) {
  const payload = encode(
    encoder.encode(JSON.stringify({ userId, expiresAt: Date.now() + lifetimeMs })),
  );
  return `${payload}.${await signature(payload, secret)}`;
}

export async function verifyDesktopSession(token: string, secret: string) {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return;
  if ((await signature(payload, secret)) !== suppliedSignature) return;

  let value: { expiresAt?: number; userId?: string };
  try {
    value = JSON.parse(new TextDecoder().decode(decode(payload))) as typeof value;
  } catch {
    return;
  }
  if (!value.userId || !value.expiresAt || value.expiresAt < Date.now()) return;
  return value.userId;
}
