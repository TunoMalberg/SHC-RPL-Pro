/**
 * PIN-Hashing für den HTML-Kundenreport.
 *
 * Warum client-seitig? Der Report ist ein `file://`-HTML, es gibt keinen
 * Server. Die PIN dient nicht als kryptografische Datenverschlüsselung,
 * sondern als _Zutrittsbarriere_ — analog zu einem Briefumschlag mit
 * Klebestreifen.
 *
 * Wir hashen per SHA-256 (Web-Crypto-API, in allen modernen Browsern inkl.
 * `file://` als Secure Context verfügbar) mit einem 16-Byte-Salt, das pro
 * Report neu erzeugt wird. Das macht Rainbow-Table-Angriffe auf sechsstellige
 * PINs zwar nicht unmöglich, aber deutlich teurer (und wichtig: jeder Report
 * bekommt einen eigenen Salt → wiederverwendete PINs sind nicht verknüpfbar).
 */

export interface PinHash {
  /** hex-encoded SHA-256 of (salt || pin) */
  hash: string;
  /** hex-encoded 16-byte salt */
  salt: string;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPin(pin: string, salt?: string): Promise<PinHash> {
  const s = salt ?? randomSalt();
  const data = new TextEncoder().encode(s + pin);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return { hash: toHex(hashBuf), salt: s };
}

export function validatePinFormat(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}