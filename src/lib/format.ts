/**
 * Text formatting helpers (v147) — consistent capitalization for user-entered
 * names and labels, applied at the edges (on input blur / on display), never
 * as a destructive rewrite of what's already stored.
 *
 * DESIGN NOTE — why these are conservative:
 *   Names are treacherous. "MacDonald", "van der Berg", "d'Angelo", "O'Brien"
 *   all break naive title-casing. We handle the common Mc/Mac/O'/apostrophe
 *   and particle cases, preserve known all-caps tokens (LLC, NJ, RSVP…), and
 *   otherwise Title Case word-by-word. This will still occasionally get an
 *   unusual name "wrong" — which is exactly why callers should format on blur
 *   (so the user sees it and can fix it) rather than silently on save.
 */

// Tokens that should stay ALL CAPS wherever they appear as a whole word.
const KEEP_UPPER = new Set([
  "LLC", "LLP", "INC", "CO", "PLLC",
  "NJ", "NY", "NYC", "PA", "CT", "FL", "CA", "USA", "US",
  "RSVP", "CEO", "CFO", "COO", "CTO", "VP", "HR", "IT", "PR",
  "BBQ", "DJ", "AV", "VIP", "ASAP", "FYI", "EOD", "TBD", "N/A",
  "ID", "PO", "PDF", "URL", "SMS",
  "II", "III", "IV",
]);

// Lowercase particles inside multi-word names (kept lower unless first word).
const PARTICLES = new Set(["van", "von", "de", "der", "den", "da", "di", "la", "le", "du", "of", "the", "and"]);

// Street/address abbreviations to normalize to a tidy capitalized form.
const STREET_CASE: Record<string, string> = {
  st: "St", street: "Street", ave: "Ave", avenue: "Avenue", rd: "Rd", road: "Road",
  blvd: "Blvd", dr: "Dr", drive: "Drive", ln: "Ln", lane: "Lane", ct: "Ct", court: "Court",
  pl: "Pl", place: "Place", ter: "Ter", terrace: "Terrace", hwy: "Hwy", pkwy: "Pkwy",
  apt: "Apt", ste: "Ste", suite: "Suite", unit: "Unit", fl: "Fl", floor: "Floor", rm: "Rm",
};

function capWord(w: string): string {
  if (!w) return w;
  const upper = w.toUpperCase();
  if (KEEP_UPPER.has(upper)) return upper;
  // Numeric or contains digits (123, 3B, 2nd) — leave as typed but tidy ordinals.
  if (/\d/.test(w)) return /^\d+(st|nd|rd|th)$/i.test(w) ? w.toLowerCase() : w;
  // Hyphenated: cap each part (Bais-Yaakov, Smith-Jones).
  if (w.includes("-")) return w.split("-").map(capWord).join("-");
  // Mc / Mac (McDonald, MacArthur) — cap the letter after the prefix.
  const mc = /^(mc)(.)(.*)$/i.exec(w);
  if (mc) return "Mc" + mc[2].toUpperCase() + mc[3].toLowerCase();
  // O'Brien, D'Angelo — cap after the apostrophe.
  const apos = /^([a-z])'([a-z])(.*)$/i.exec(w);
  if (apos) return apos[1].toUpperCase() + "'" + apos[2].toUpperCase() + apos[3].toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Title Case for names and labels, preserving known abbreviations. */
export function titleCase(input: string | null | undefined): string {
  if (!input) return "";
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return "";
  const words = s.split(" ");
  return words.map((w, i) => {
    const lower = w.toLowerCase();
    // Particles stay lowercase unless they lead the string.
    if (i > 0 && PARTICLES.has(lower) && !KEEP_UPPER.has(w.toUpperCase())) return lower;
    return capWord(w);
  }).join(" ");
}

/** Sentence case for notes: capitalize the first letter, leave the rest as
 *  typed (so mid-sentence proper nouns and acronyms the user wrote stay). */
export function sentenceCase(input: string | null | undefined): string {
  if (!input) return "";
  const s = input.replace(/\s+/g, " ").replace(/^\s+/, "");
  if (!s) return "";
  // Capitalize the first alphabetical character; preserve everything after.
  return s.replace(/^([^a-zA-Z]*)([a-z])/, (_m, pre, ch) => pre + ch.toUpperCase());
}

/** Address: title-case words, normalize street abbreviations, keep state codes
 *  and ZIPs intact. Best-effort — won't damage what it doesn't recognize. */
export function formatAddress(input: string | null | undefined): string {
  if (!input) return "";
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s.split(" ").map((w) => {
    const bare = w.replace(/[.,]/g, "");
    const lower = bare.toLowerCase();
    if (STREET_CASE[lower]) return w.replace(bare, STREET_CASE[lower]);
    if (KEEP_UPPER.has(bare.toUpperCase())) return w.toUpperCase();
    if (/^\d+$/.test(bare)) return w;                 // house number / ZIP
    if (/^\d/.test(bare)) return w;                   // 3B, 12th handled loosely
    return capWord(w);
  }).join(" ");
}

/** Email — always lowercase, trimmed. Never title-cased. */
export function formatEmail(input: string | null | undefined): string {
  return (input ?? "").trim().toLowerCase();
}

/** Phone — consistent US formatting when it looks like 10 digits; otherwise
 *  return the trimmed input unchanged (don't mangle international/extensions). */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return "";
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return input.trim();
}
