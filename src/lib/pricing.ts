// ═══════════════════════════════════════════════════════════════════════════
// PRICING ENGINE — port of CONFIG.gs buffet constants and fee math
// ═══════════════════════════════════════════════════════════════════════════

export const PRICING = {
  DEPOSIT_AMOUNT: 500,
  CC_FEE_PERCENT: 0.03,
  TAX_RATE: 0.06625,

  BUFFET_SINGLE_PP: 60,
  BUFFET_DOUBLE_PP: 70,
  BUFFET_CHILDREN_PP: 50,
  FULL_SERVICE_PP: 60,

  BUFFET_CHARGER_PP: 4,
  BUFFET_STARTER_PP: 16,
  BUFFET_WRAP_PP: 7,
  BUFFET_SANDWICH_PP: 7,
  BUFFET_THURSDAY_PP: 7.5,
  BUFFET_BREAD_CHUMMUS_PP: 6,
  BUFFET_DESSERT_PASSING_PP: 5,
  BUFFET_DESSERT_STATION_PP: 6,
  BUFFET_PREMIUM_MEAT_PP: 2.5,
  BUFFET_SOUP_SINGLE: 4,
  BUFFET_SOUP_DOUBLE: 6,
  BUFFET_FRUIT_PLATTER: 125,
  BUFFET_PETITE_FOUR_PLATTER: 125,
} as const;

/** CC fee: amount received / 1.03 = applied; remainder is the surcharge. */
export function calcCCFee(amountReceived: number): { applied: number; fee: number } {
  const applied = Math.round((amountReceived / (1 + PRICING.CC_FEE_PERCENT)) * 100) / 100;
  const fee = Math.round((amountReceived - applied) * 100) / 100;
  return { applied, fee };
}

/** Given a balance, what should the customer pay by card to net that balance. */
export function grossUpForCC(balance: number): { total: number; fee: number } {
  const total = Math.round(balance * (1 + PRICING.CC_FEE_PERCENT) * 100) / 100;
  return { total, fee: Math.round((total - balance) * 100) / 100 };
}

/** Double Buffet tier from per-side guest count: 10 / 20 / 30 / 40+. */
export function buffetTier(guestCountPerSide: number): "10" | "20" | "30" | "40" {
  if (guestCountPerSide <= 10) return "10";
  if (guestCountPerSide <= 20) return "20";
  if (guestCountPerSide <= 30) return "30";
  return "40";
}

export function buffetDishCount(guestCountPerSide: number): number {
  return { "10": 4, "20": 6, "30": 8, "40": 10 }[buffetTier(guestCountPerSide)];
}

/** Included hot-dish refills: every 10 guests above 40 adds 2, capped at 12. */
export function buffetRefillCount(guestCount: number): number {
  if (guestCount < 50) return 0;
  if (guestCount >= 100) return 12;
  return Math.floor((guestCount - 40) / 10) * 2;
}

export function buffetRefillDisplay(guestCount: number): string {
  const r = buffetRefillCount(guestCount);
  return r === 0 ? "No included hot dish refills" : `Up to ${r} hot dish refills`;
}

/** Base buffet total before add-ons and tax. */
export function buffetBaseTotal(
  menuType: string,
  men: number,
  women: number,
  children: number
): number {
  const pp =
    menuType === "Double Buffet" ? PRICING.BUFFET_DOUBLE_PP :
    menuType === "Single Buffet" ? PRICING.BUFFET_SINGLE_PP :
    PRICING.FULL_SERVICE_PP;
  return (men + women) * pp + children * PRICING.BUFFET_CHILDREN_PP;
}

export interface ChargeRow {
  description: string;
  quantity: number;
  unit_price: number;
  taxable: boolean;
}

/** Invoice totals from a base amount plus line-item charges. */
export function invoiceTotals(base: number, charges: ChargeRow[]) {
  const taxableExtra = charges.filter(c => c.taxable).reduce((s, c) => s + c.quantity * c.unit_price, 0);
  const nonTaxable   = charges.filter(c => !c.taxable).reduce((s, c) => s + c.quantity * c.unit_price, 0);
  const subtotal = Math.round((base + taxableExtra + nonTaxable) * 100) / 100;
  // ⚠️ F0 GAP — KNOWN, NOT FIXED. This is the legacy buffet path (the
  // Apps Script port) and it still reads the hard-coded NJ constant. It is
  // correct for Burger Bar and WRONG for any non-NJ tenant using template-
  // driven buffets. The Studio/proposal path is fixed; this one needs the
  // rate threaded from the caller, which means touching the buffet invoice
  // surface. Deliberately deferred, not overlooked — see menu/page.tsx too.
  const tax = Math.round((base + taxableExtra) * PRICING.TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { subtotal, tax, total };
}
