import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "v1";

function getEncryptionKey(): Buffer {
  const raw = process.env.COMMUNICATION_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "COMMUNICATION_ENCRYPTION_KEY is not set. Add a 32-byte secret (hex or base64) on the server.",
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const fromBase64 = Buffer.from(raw, "base64");
  if (fromBase64.length === 32) {
    return fromBase64;
  }

  throw new Error("COMMUNICATION_ENCRYPTION_KEY must be 32 bytes as 64-char hex or base64.");
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== PREFIX || !ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid encrypted payload.");
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function hashVerifyToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}
