"use client";
import { useEffect, useRef } from "react";

export interface PlaceValue {
  formatted: string;      // formatted_address (or free-typed text)
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  source: "places" | "manual";  // picked a suggestion vs. free-typed
}

// Minimal shapes for the Google Maps JS objects we touch (avoids `any`).
interface GAutocomplete {
  addListener: (ev: string, cb: () => void) => void;
  getPlace: () => {
    formatted_address?: string;
    place_id?: string;
    geometry?: { location?: { lat: () => number; lng: () => number } };
    address_components?: { long_name: string; short_name: string; types: string[] }[];
  };
}
interface GWindow {
  google?: { maps?: { places?: { Autocomplete: new (el: HTMLInputElement, opts?: object) => GAutocomplete } } };
  __gmapsLoading?: boolean;
  __gmapsReady?: boolean;
}

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/** Load the Maps JS + Places library once, client-side only. Resolves when
 *  window.google.maps.places is available; rejects if no key is configured. */
function loadPlaces(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject();
    const w = window as unknown as GWindow;
    if (!KEY) return reject();
    if (w.google?.maps?.places) return resolve();
    // Someone else already kicked off the load — poll for readiness.
    if (w.__gmapsLoading) {
      const t = setInterval(() => {
        if (w.google?.maps?.places) { clearInterval(t); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(t); w.google?.maps?.places ? resolve() : reject(); }, 8000);
      return;
    }
    w.__gmapsLoading = true;
    const sc = document.createElement("script");
    sc.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places`;
    sc.async = true;
    sc.defer = true;
    sc.onload = () => { w.__gmapsReady = true; resolve(); };
    sc.onerror = () => reject();
    document.head.appendChild(sc);
  });
}

function pick(components: { long_name: string; short_name: string; types: string[] }[] | undefined, type: string, short = false): string | null {
  const c = components?.find((x) => x.types.includes(type));
  return c ? (short ? c.short_name : c.long_name) : null;
}

/** An address field that upgrades to Google Places autocomplete when a key is
 *  configured, and degrades to a plain text input (saved as manual) otherwise. */
export default function AddressAutocomplete({
  value, onChange, placeholder, id,
}: {
  value: string;
  onChange: (v: PlaceValue) => void;
  placeholder?: string;
  id?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    let ac: GAutocomplete | null = null;
    let cancelled = false;
    loadPlaces().then(() => {
      if (cancelled || !ref.current) return;
      const w = window as unknown as GWindow;
      const P = w.google!.maps!.places!;
      ac = new P.Autocomplete(ref.current, { types: ["geocode", "establishment"], fields: ["formatted_address", "geometry", "address_components", "place_id"] });
      ac.addListener("place_changed", () => {
        const place = ac!.getPlace();
        const comp = place.address_components;
        const streetNum = pick(comp, "street_number");
        const route = pick(comp, "route");
        const loc = place.geometry?.location;
        cbRef.current({
          formatted: place.formatted_address ?? ref.current!.value,
          street: [streetNum, route].filter(Boolean).join(" ") || null,
          city: pick(comp, "locality") ?? pick(comp, "postal_town") ?? pick(comp, "sublocality"),
          state: pick(comp, "administrative_area_level_1", true),
          zip: pick(comp, "postal_code"),
          lat: loc ? loc.lat() : null,
          lng: loc ? loc.lng() : null,
          placeId: place.place_id ?? null,
          source: "places",
        });
      });
    }).catch(() => { /* no key / load failure → stays a plain input */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <input
        ref={ref}
        id={id}
        className="field"
        defaultValue={value}
        placeholder={placeholder ?? (KEY ? "Start typing an address…" : "123 Cedar Ave, Lakewood, NJ 08701")}
        onChange={(e) => {
          // Free typing → manual until/unless a suggestion is chosen.
          cbRef.current({
            formatted: e.target.value,
            street: null, city: null, state: null, zip: null,
            lat: null, lng: null, placeId: null, source: "manual",
          });
        }}
      />
      {!KEY && (
        <p className="text-[10px] text-amber-600 mt-1">
          ⓘ Address autocomplete off — set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable suggestions. Typed addresses save normally.
        </p>
      )}
    </>
  );
}
