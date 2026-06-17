import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// ── Types ─────────────────────────────────────────────────────────────────────

export type EncryptedPayload = {
  ciphertext: string // base64
  iv: string         // base64, 16 bytes
  authTag: string    // base64, 16 bytes (GCM auth tag)
}

// ── Key loading ───────────────────────────────────────────────────────────────

/**
 * Reads APP_SECRETS_ENCRYPTION_KEY from the environment (preferred).
 * Falls back to COURIER_CONFIG_ENCRYPTION_KEY for backward compatibility with
 * existing deployments — logs a deprecation warning on first use.
 * Must be exactly 64 hex characters (= 32 bytes for AES-256).
 * Generate with: openssl rand -hex 32
 * Throws if unset or wrong length — never falls back to plaintext.
 */
export function getEncryptionKey(): Buffer {
  let hex = process.env.APP_SECRETS_ENCRYPTION_KEY
  if (!hex) {
    hex = process.env.COURIER_CONFIG_ENCRYPTION_KEY
    if (hex) {
      console.warn(
        "[crypto] COURIER_CONFIG_ENCRYPTION_KEY is deprecated — rename it to " +
          "APP_SECRETS_ENCRYPTION_KEY in your .env / Coolify env vars."
      )
    }
  }
  if (!hex) {
    throw new Error(
      "APP_SECRETS_ENCRYPTION_KEY is not set. " +
        "Generate one with: openssl rand -hex 32"
    )
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "APP_SECRETS_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
        "Generate one with: openssl rand -hex 32"
    )
  }
  return Buffer.from(hex, "hex")
}

// ── Encrypt ───────────────────────────────────────────────────────────────────

/**
 * Encrypts plaintext using AES-256-GCM.
 * A fresh random 16-byte IV is generated on every call.
 * Returns ciphertext, iv, and authTag all base64-encoded.
 */
export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = getEncryptionKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv("aes-256-gcm", key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  }
}

// ── Decrypt ───────────────────────────────────────────────────────────────────

/**
 * Decrypts an EncryptedPayload produced by encryptSecret().
 * Verifies the GCM auth tag — throws on tampering or wrong key.
 * Never returns garbage as a valid result.
 */
export function decryptSecret(payload: EncryptedPayload): string {
  const key = getEncryptionKey()
  const iv = Buffer.from(payload.iv, "base64")
  const authTag = Buffer.from(payload.authTag, "base64")
  const ciphertext = Buffer.from(payload.ciphertext, "base64")

  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8")
}

// ── Mask ──────────────────────────────────────────────────────────────────────

/**
 * Returns a masked display string showing only the last 4 characters.
 * For display purposes only — never use for security decisions.
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "••••"
  return "••••" + plaintext.slice(-4)
}
