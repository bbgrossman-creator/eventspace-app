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
}

/** One source of truth for a booking's invoice math, shared by the
 *  detail page, invoice, and the back-office dashboard. */
export function bookingFinancials(b: Booking, charges: ChargeLike[]): BookingFinancials {
  const guests = deriveGuests(b);
  // For non-gendered counts, route adult heads through the "men" slot — both
  // men and women bill the same adult per-person rate, so the total is identical.
  const adultM = guests.gendered ? guests.men : guests.adults;
  const adultW = guests.gendered ? guests.women : 0;
  const base = buffetBaseTotal(b.menu_type, adultM, adultW, guests.children);
  const { subtotal, tax, total } = invoiceTotals(base, charges);
  return { guests, base, subtotal, tax, total };
}
