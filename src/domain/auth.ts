import Database from "@tauri-apps/plugin-sql";

export const DEFAULT_ADMIN_PIN = "1234";

const ADMIN_PIN_HASH_KEY = "admin_pin_hash";
const ADMIN_PIN_SALT_KEY = "admin_pin_salt";
const ADMIN_PIN_MUST_CHANGE_KEY = "admin_pin_must_change";
const LEGACY_ADMIN_PIN_KEY = "admin_pin";
const PIN_HASH_ITERATIONS = 120_000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

function generateSalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToHex(salt);
}

async function upsertSetting(db: Database, key: string, value: string, now: number) {
  await db.execute(
    'INSERT OR REPLACE INTO settings ("key", "value", updated_at_ms) VALUES (?, ?, ?)',
    [key, value, now]
  );
}

async function hashPin(pin: string, saltHex: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: PIN_HASH_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

async function loadAuthSettings(db: Database): Promise<Record<string, string>> {
  const rows = await db.select<{ key: string; value: string }[]>(
    'SELECT "key", "value" FROM settings WHERE "key" IN (?, ?, ?, ?)',
    [ADMIN_PIN_HASH_KEY, ADMIN_PIN_SALT_KEY, ADMIN_PIN_MUST_CHANGE_KEY, LEGACY_ADMIN_PIN_KEY]
  );

  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function validateAdminPin(pin: string): string | null {
  if (!/^\d{4,12}$/.test(pin)) {
    return "管理者PINは4〜12桁の数字で入力してください。";
  }

  return null;
}

export async function setAdminPin(
  db: Database,
  pin: string,
  mustChange: boolean
): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);
  const now = Date.now();

  await upsertSetting(db, ADMIN_PIN_HASH_KEY, hash, now);
  await upsertSetting(db, ADMIN_PIN_SALT_KEY, salt, now);
  await upsertSetting(db, ADMIN_PIN_MUST_CHANGE_KEY, mustChange ? "1" : "0", now);
  await db.execute('DELETE FROM settings WHERE "key" = ?', [LEGACY_ADMIN_PIN_KEY]);
}

export async function ensureAdminPinSettings(db: Database): Promise<void> {
  const settings = await loadAuthSettings(db);
  const hasHashedPin = settings[ADMIN_PIN_HASH_KEY] && settings[ADMIN_PIN_SALT_KEY];

  if (hasHashedPin) {
    if (settings[ADMIN_PIN_MUST_CHANGE_KEY] === undefined) {
      await upsertSetting(db, ADMIN_PIN_MUST_CHANGE_KEY, "0", Date.now());
    }
    if (settings[LEGACY_ADMIN_PIN_KEY] !== undefined) {
      await db.execute('DELETE FROM settings WHERE "key" = ?', [LEGACY_ADMIN_PIN_KEY]);
    }
    return;
  }

  const migratedPin = settings[LEGACY_ADMIN_PIN_KEY] ?? DEFAULT_ADMIN_PIN;
  await setAdminPin(db, migratedPin, migratedPin === DEFAULT_ADMIN_PIN);
}

export async function verifyAdminPin(db: Database, pin: string): Promise<boolean> {
  const settings = await loadAuthSettings(db);
  const storedHash = settings[ADMIN_PIN_HASH_KEY];
  const salt = settings[ADMIN_PIN_SALT_KEY];

  if (!storedHash || !salt) {
    return false;
  }

  const candidateHash = await hashPin(pin, salt);
  return candidateHash === storedHash;
}

export async function shouldChangeAdminPin(db: Database): Promise<boolean> {
  const rows = await db.select<{ value: string }[]>(
    'SELECT "value" FROM settings WHERE "key" = ?',
    [ADMIN_PIN_MUST_CHANGE_KEY]
  );

  return rows[0]?.value === "1";
}
