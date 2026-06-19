import { Booking, deriveGuests, DerivedGuests } from "./workflow";
import { buffetBaseTotal, invoiceTotals } from "./pricing";

export interface ChargeLike {
  description: string;
  quantity: number;
  unit_price: number;
  taxable: boolean;
}

export interface BookingFinancials {
  guests: DerivedGuests;
  base: number;
  subtotal: number;
  tax: number;
  total: number;
  billedToMinimum: boolean;
  minGuests: number;
  actualHeads: number;
}

/** One source of truth for a booking's invoice math, shared by the
 *  detail page, invoice, and the back-office dashboard. */
export function bookingFinancials(b: Booking, charges: ChargeLike[]): BookingFinancials {
  const guests = deriveGuests(b);
  // For non-gendered counts, route adult heads through the "men" slot — both
  // men and women bill the same adult per-person rate, so the total is identical.
  let adultM = guests.gendered ? guests.men : guests.adults;
  let adultW = guests.gendered ? guests.women : 0;
  let children = guests.children;

  // ── Minimum-billing mode ──
  // When the booking is flagged bill_at_minimum and the actual party is below the
  // menu's guest minimum, charge the minimum headcount instead. The actual counts
  // are unchanged everywhere else (kitchen/worksheet still see real numbers).
  const minGuests = (b.menu as unknown as { min_guests?: number })?.min_guests ?? 0;
  const actualHeads = adultM + adultW + children;
  let billedToMinimum = false;
  if (b.bill_at_minimum && minGuests > 0 && actualHeads > 0 && actualHeads < minGuests) {
    // Bill the shortfall as additional adult heads (cheapest-correct: minimum at adult rate).
    const shortfall = minGuests - actualHeads;
    adultM += shortfall;
    billedToMinimum = true;
  }
  const base = buffetBaseTotal(b.menu_type, adultM, adultW, children);
  const { subtotal, tax, total } = invoiceTotals(base, charges);
  return { guests, base, subtotal, tax, total, billedToMinimum, minGuests, actualHeads };
}
