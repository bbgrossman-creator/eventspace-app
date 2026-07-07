"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, logActivity } from "@/lib/supabase";
import { runActionAutomation } from "@/lib/automation";
import { loadPolicies, Policies, changeoverMinutes } from "@/lib/policies";
import { Booking, findConflicts, fmtTime, fmtDate, stageFor, HOLD_HOURS, dayCapacityUsed, capacityPointsFor } from "@/lib/workflow";
import { PRICING } from "@/lib/pricing";
import AddressAutocomplete, { PlaceValue } from "@/components/AddressAutocomplete";
import { matchHousehold, computeCustomerStats, CustomerChargeRow } from "@/lib/customer";
import { sendEmail } from "@/lib/sendEmail";
import { FULL_SERVICE_MENU, BUFFET_MENU, BUSINESS_PHONE } from "@/lib/automation";

interface PackageGuide {
  key: string; name: string; price_label: string | null;
  includes: string | null; best_for: string | null;
  talk_track: string | null; upsells: string | null;
}

interface DraftRow {
  id: string; draft_number: string | null; status: string;
  customer_name: string | null; phone: string | null; email: string | null;
  contact2_name: string | null; contact2_phone: string | null; contact2_email: string | null;
  event_type: string | null; celebrant_name: string | null; celebrant_relation: string | null;
  celebrant_age: number | null; affiliation: string | null;
  referral_channel: string | null; referral_name: string | null;
  event_date: string | null; start_time: string | null; duration: string | null;
  guest_count: string | null; venue_type: string | null; venue_room: string | null;
  off_premise_location: string | null; notes: string | null;
  last_autosaved: string | null; updated_at: string;
}

const EVENT_TYPES = ["Bar Mitzvah", "Bat Mitzvah", "Wedding", "Engagement", "Sheva Brochos", "Birthday Party", "Corporate Event", "Other"];
const TIMES = Array.from({ length: 25 }, (_, i) => {
  const mins = 11 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

function roomsMapForMemory(rooms: { id: string; name: string }[]): Map<string, string> {
  return new Map(rooms.map((r) => [r.id, r.name]));
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 whitespace-nowrap">{children}</h3>
      <div className="h-px bg-slate-100 flex-1" />
    </div>
  );
}

export default function NewInquiry() {
  const router = useRouter();
  const [all, setAll] = useState<Booking[]>([]);
  const [f, setF] = useState({
    contact_name: "", phone: "", email: "",
    contact2_name: "", contact2_phone: "", contact2_email: "",
    event_type: "", event_date: "", event_time: "19:00", notes: "", expected_hours: "",
    deposit_ready: "", card_last4: "",
  });
  const [showContact2, setShowContact2] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [wtWhen, setWtWhen] = useState("");
  const [wtAssignee, setWtAssignee] = useState("");
  const [wtNotes, setWtNotes] = useState("");
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; name: string; guest_capacity: number | null }[]>([]);
  const [roomId, setRoomId] = useState<string>("");
  const [locType, setLocType] = useState<"on_prem" | "off_prem">("on_prem");
  const [locName, setLocName] = useState("");
  const [place, setPlace] = useState<PlaceValue | null>(null);
  const [wtLoad, setWtLoad] = useState<"normal" | "heavy" | "vheavy">("normal");
  const addrLine = place?.formatted ?? "";
  const offAddr = [locName.trim() && `${locName.trim()} —`, addrLine.trim()].filter(Boolean).join(" ");
  // Off-premise address payload — structured components from Places, or a
  // free-typed manual address with null coordinates. Shared by both inserts.
  // Relationship-graph seed fields (Blueprint §3a) — unbackfillable, so they
  // ride every insert from birth. Lifecycle prediction + institution nodes
  // feed on these at Phase 2/3.
  const relationshipSeeds = () => ({
    celebrant_name: celName.trim() || null,
    celebrant_relation: celRelation || null,
    celebrant_age: celAge ? Number(celAge) : null,
    affiliation: affiliation.trim() || null,
  });
  const offFields = () => locType === "off_prem" ? {
    offprem_address: offAddr || null,
    offprem_street: place?.street ?? null,
    offprem_city: place?.city ?? null,
    offprem_state: place?.state ?? null,
    offprem_zip: place?.zip ?? null,
    offprem_lat: place?.lat ?? null,
    offprem_lng: place?.lng ?? null,
    offprem_place_id: place?.placeId ?? null,
    offprem_source: place?.source ?? "manual",
  } : {
    offprem_address: null, offprem_street: null, offprem_city: null,
    offprem_state: null, offprem_zip: null, offprem_lat: null,
    offprem_lng: null, offprem_place_id: null, offprem_source: null,
  };


  const [estGuests, setEstGuests] = useState("");
  const [capOverride, setCapOverride] = useState(false);
  useEffect(() => {
    supabase.from("rooms").select("id,name,guest_capacity,active").eq("active", true).order("sort_order")
      .then(({ data }) => {
        // Server filters active=true; filter again client-side so an inactive
        // room can never count toward the hybrid condition, whatever the query.
        const r = ((data ?? []) as (typeof rooms[number] & { active?: boolean })[])
          .filter((x) => x.active !== false);
        setRooms(r);
        if (r.length >= 1) setRoomId(r[0].id);
      });
  }, []);
  const wtRef = useRef<HTMLDivElement>(null);
  const c2Ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showWalkthrough) setTimeout(() => wtRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 40);
  }, [showWalkthrough]);
  useEffect(() => {
    if (showContact2) setTimeout(() => c2Ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 40);
  }, [showContact2]);
  useEffect(() => {
    supabase.from("staff").select("id,name").eq("active", true).order("sort_order")
      .then(({ data }) => setStaff((data ?? []) as { id: string; name: string }[]));
  }, []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [guides, setGuides] = useState<PackageGuide[]>([]);
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const [showEmailMenus, setShowEmailMenus] = useState(false);

  useEffect(() => {
    supabase.from("bookings").select("*").then(({ data }) => setAll((data ?? []) as Booking[]));
    supabase.from("package_guides").select("*").order("sort_order")
      .then(({ data }) => setGuides((data ?? []) as PackageGuide[]));
  }, []);

  const [pol, setPol] = useState<Policies | null>(null);

  // The form adapts to configuration — the rep only answers questions that
  // have more than one possible answer:
  //   rooms + off-prem  → radio choice
  //   rooms only        → room select (hidden if just one room)
  //   off-prem only     → straight to the address form, no question
  //   neither           → configuration error, reserving disabled
  const offOn = pol?.offprem_enabled === 1;
  const hasRooms = rooms.length > 0;
  const locMode: "choice" | "rooms_only" | "offprem_only" | "none" =
    hasRooms && offOn ? "choice" : hasRooms ? "rooms_only" : offOn ? "offprem_only" : "none";
  useEffect(() => {
    if (locMode === "offprem_only" && locType !== "off_prem") setLocType("off_prem");
    if (locMode === "rooms_only" && locType !== "on_prem") setLocType("on_prem");
  }, [locMode, locType]);

  useEffect(() => { loadPolicies().then(setPol); }, []);

  const conflicts =
    f.event_date && f.event_time && pol
      ? findConflicts(all, f.event_date, f.event_time, undefined, {
          newHours: f.expected_hours ? Number(f.expected_hours) : pol.service_hours,
          defaultHours: pol.service_hours,
          bufferMin: changeoverMinutes(pol),
          roomId: roomId || null,
          locationType: locType,
        })
      : (f.event_date && f.event_time ? findConflicts(all, f.event_date, f.event_time) : []);

  // Daily production capacity: points used today vs available. Warn (never
  // silently block) when this job would push past the cap.
  const cap = (() => {
    if (!pol || pol.capacity_enabled !== 1 || !f.event_date) return null;
    const used = dayCapacityUsed(all, f.event_date, pol);
    const extra = locType === "off_prem" ? ({ normal: 0, heavy: 1, vheavy: 2 }[wtLoad]) : 0;
    const mine = capacityPointsFor(estGuests ? Number(estGuests) : 0, null, pol) + extra;
    return { used, mine, extra, total: pol.daily_capacity_points, over: used + mine > pol.daily_capacity_points };
  })();

  const confirmedClash = conflicts.some((c) =>
    !["on_hold", "conflict", "waitlisted", "hold_expired"].includes(c.status));

  // Same-day events (real: from the loaded bookings), for the "nearby" read.
  const nearbyCount = f.event_date
    ? all.filter((b) => b.event_date === f.event_date && !["cancelled", "lead", "lead_lost"].includes(b.status)).length
    : 0;
  // Day-capacity read as a plain-language label (real: capacity engine).
  const capLabel = cap
    ? (cap.used + cap.mine <= cap.total * 0.5 ? "Light" : cap.used + cap.mine <= cap.total * 0.85 ? "Moderate" : cap.over ? "Over capacity" : "Heavy")
    : null;
  // Room fit (real: room capacity vs estimate).
  const chosenRoom = rooms.find((r) => r.id === roomId);
  const roomFits = chosenRoom?.guest_capacity && estGuests
    ? Number(estGuests) <= chosenRoom.guest_capacity : null;
  // Smooth-scroll to a panel and pulse it so the eye lands there.
  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("pulse-alert");
    setTimeout(() => el.classList.remove("pulse-alert"), 2600);
  }

  // Duplicate-inquiry check: same phone (or email) already on an active booking.
  // Warns — doesn't block — so a spouse calling twice doesn't create a silent double.
  const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const dupes = (() => {
    const ph = digits(f.phone); const em = f.email.trim().toLowerCase();
    if (ph.length < 7 && !em) return [];
    return all.filter((b) =>
      b.status !== "cancelled" &&
      ((ph.length >= 7 && digits(b.phone) === ph) || (!!em && (b.email ?? "").toLowerCase() === em)));
  })();

  const [celName, setCelName] = useState("");
  const [celRelation, setCelRelation] = useState("");
  const [celAge, setCelAge] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [refChannel, setRefChannel] = useState("");
  const [refName, setRefName] = useState("");
  const referralValue = refChannel === "Referral" && refName.trim()
    ? `Referral: ${refName.trim()}` : (refChannel || null);
  const [memCharges, setMemCharges] = useState<CustomerChargeRow[]>([]);
  const household = useMemo(() => {
    if (dupes.length === 0) return [];
    const seed = { id: "", phone: f.phone, email: f.email } as Booking;
    return matchHousehold(all, seed);
  }, [dupes.length, all, f.phone, f.email]);
  useEffect(() => {
    const ids = household.map((x) => x.id).filter(Boolean);
    if (!ids.length) { setMemCharges([]); return; }
    supabase.from("charges").select("booking_id,unit_price,quantity,taxable,description").in("booking_id", ids)
      .then(({ data }) => setMemCharges((data ?? []) as CustomerChargeRow[]));
  }, [household]);
  const memory = useMemo(
    () => computeCustomerStats(household, memCharges, [], roomsMapForMemory(rooms)),
    [household, memCharges, rooms]);

  // The recommendation — deterministic, and it can justify itself.
  const recommendation = (() => {
    if (!f.event_date || !f.contact_name.trim()) return null;
    if (confirmedClash) return { action: "Resolve the conflict first", tone: "warn", reasons: ["This time clashes a confirmed booking"] };
    if (roomFits === false) return { action: "Confirm room or guest count", tone: "warn", reasons: [`${chosenRoom?.name} seats ${chosenRoom?.guest_capacity}, estimate is ${estGuests}`] };
    const reasons: string[] = [];
    if (conflicts.length === 0) reasons.push("No conflicts on this date");
    if (roomFits) reasons.push(`${estGuests} fits ${chosenRoom?.name} comfortably`);
    if (memory) reasons.push(`Returning customer · ${memory.events} prior event${memory.events === 1 ? "" : "s"}`);
    else if (f.event_type && estGuests) reasons.push("Details are firm enough to hold");
    if (reasons.length === 0) return null;
    return { action: "Reserve the date", tone: "go", reasons };
  })();

  function set(k: string, v: string) { setF((p) => ({ ...p, [k]: v })); }

  async function nextLeadNum(): Promise<string> {
    const { data } = await supabase.from("bookings").select("invoice_num")
      .like("invoice_num", "L-%").order("invoice_num", { ascending: false }).limit(1);
    const last = data?.[0]?.invoice_num;
    const n = last && /^L-\d+$/.test(last) ? parseInt(last.slice(2), 10) + 1 : 1001;
    return `L-${n}`;
  }

  /** Save as a sales opportunity: L-number, status "lead" — no hold, no real
   *  invoice number, never enters conflict detection. Optionally schedules the
   *  first walkthrough in the same stroke. */
  async function createLead(withWalkthrough: boolean) {
    setErr("");
    if (!f.contact_name.trim()) { setErr("Customer name is required."); return; }
    if (!f.phone.trim() && !f.email.trim()) { setErr("Enter a phone number or email."); return; }
    if (withWalkthrough && !wtWhen) { setErr("Pick a date & time for the walkthrough."); return; }
    setSaving(true);
    const invoice_num = await nextLeadNum();
    const { data, error } = await supabase.from("bookings").insert({
      invoice_num, status: "lead",
      contact_name: f.contact_name.trim(),
      phone: f.phone.trim() || null, email: f.email.trim() || null,
      contact2_name: f.contact2_name.trim() || null,
      contact2_phone: f.contact2_phone.trim() || null,
      contact2_email: f.contact2_email.trim() || null,
      room_id: locType === "on_prem" ? (roomId || null) : null,
      location_type: locType,
      ...offFields(),
      ...relationshipSeeds(),
      referral_source: referralValue,
      capacity_points: cap?.extra ? cap.mine : null,
      est_guests: estGuests ? Number(estGuests) : null,
      event_type: f.event_type || null,
      event_date: f.event_date || null, event_time: f.event_time || null,
      expected_hours: f.expected_hours ? Number(f.expected_hours) : null,
      notes: f.notes.trim() || null,
      hold_expires: null,
    }).select().single();
    if (error || !data) { setErr(error?.message ?? "Couldn't save the lead."); setSaving(false); return; }
    await logActivity(data.id, invoice_num, "Lead Created",
      `Sales opportunity${f.event_date ? ` — estimated date ${f.event_date}` : ""}${f.event_type ? ` · ${f.event_type}` : ""}. No date reserved.`);
    if (withWalkthrough) {
      const { error: tpErr } = await supabase.from("touchpoints").insert({
        booking_id: data.id, invoice_num, kind: "walkthrough",
        scheduled_at: wtWhen, notes: wtNotes.trim() || null, assignee: wtAssignee || null,
      });
      if (!tpErr) {
        await logActivity(data.id, invoice_num, "Walkthrough Scheduled",
          `${new Date(wtWhen).toLocaleString()}${wtAssignee ? ` · with ${wtAssignee}` : ""}`);
      }
    }
    await markDraftConverted(data.id);
    router.push(`/bookings/${data.id}`);
  }

  async function createBooking() {
    setErr("");
    if (!f.contact_name.trim()) { setErr("Customer name is required."); return; }
    if (!f.phone.trim() && !f.email.trim()) { setErr("Enter a phone number or email."); return; }
    if (!f.event_type) { setErr("Event type is required."); return; }
    if (!f.event_date) { setErr("Event date is required."); return; }
    if (!f.event_time) { setErr("Event time is required."); return; }
    if (locMode === "none") { setErr("No bookable locations configured — add a room or enable off-premise in Locations & Capacity."); return; }
    if (locType === "off_prem" && !addrLine.trim()) { setErr("Enter the event address for an off-premise event."); return; }
    if (cap?.over && !capOverride) { setErr("This day is at production capacity — tick the override to book anyway, or pick another date."); return; }
    setSaving(true);

    const { data: invData, error: invErr } = await supabase.rpc("next_invoice_num");
    if (invErr) { setErr(invErr.message); setSaving(false); return; }
    const invoice_num = invData as string;

    const hasConflict = conflicts.length > 0;
    const holdExpires = new Date();
    holdExpires.setHours(holdExpires.getHours() + HOLD_HOURS);

    // How conflicts are handled depends on the owner's policy.
    const cpol = await loadPolicies();
    const holder = hasConflict ? conflicts[0] : null;
    // First-right-of-refusal applies ONLY when the existing party is an
    // unconfirmed HOLD. If they're already booked (deposit down / past hold),
    // the date is simply taken — no refusal clock.
    const holderIsUnconfirmed = !!holder && (holder.status === "on_hold" || holder.status === "conflict");
    // First-right-of-refusal now triggers ONLY when the challenger is ready to
    // commit (card secured). Mere interest gives no standing to disturb the holder.
    const useRefusal = hasConflict && cpol.conflict_mode === "first_refusal"
      && holderIsUnconfirmed && f.deposit_ready;
    // B inquired on a held date but isn't ready to commit → save as a lead with
    // no claim on the date. The holder is untouched.
    const noStandingLead = hasConflict && holderIsUnconfirmed && !f.deposit_ready
      && cpol.conflict_mode === "first_refusal";

    let newStatus: string = "on_hold";
    let newHoldExpires: string | null = holdExpires.toISOString();
    if (hasConflict) {
      newStatus = (useRefusal || noStandingLead) ? "waitlisted" : "conflict";
      newHoldExpires = null;
    }

    const { data, error } = await supabase
      .from("bookings")
      .insert({
        invoice_num,
        contact_name: f.contact_name.trim(),
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        contact2_name: f.contact2_name.trim() || null,
        contact2_phone: f.contact2_phone.trim() || null,
        contact2_email: f.contact2_email.trim() || null,
        room_id: locType === "on_prem" ? (roomId || null) : null,
        location_type: locType,
        ...offFields(),
        ...relationshipSeeds(),
        referral_source: referralValue,
        capacity_points: cap?.extra ? cap.mine : null,
        est_guests: estGuests ? Number(estGuests) : null,
        event_type: f.event_type || null,
        event_date: f.event_date || null,
        event_time: f.event_time || null,
        menu_type: "Not Sure Yet",
        notes: f.notes.trim() || null,
        expected_hours: f.expected_hours ? Number(f.expected_hours) : null,
        status: newStatus,
        hold_expires: newHoldExpires,
        waitlisted_for: (useRefusal || noStandingLead) && holder ? holder.id : null,
        deposit_ready: useRefusal,
        card_last4: useRefusal && f.card_last4 ? f.card_last4 : null,
      })
      .select()
      .single();

    if (error) { setErr(error.message); setSaving(false); return; }

    // Only a deposit-ready challenger starts the holder's decision clock.
    if (useRefusal && holder) {
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + cpol.refusal_deadline_hours);
      await supabase.from("bookings").update({
        refusal_deadline: deadline.toISOString(),
        refusal_challenger: data.id,
      }).eq("id", holder.id);
      await logActivity(holder.id, holder.invoice_num, "First Right of Refusal Started",
        `${f.contact_name.trim()} is ready to commit (card secured) and wants this date. Holder has until ${deadline.toLocaleString()} to confirm with a deposit.`, "WARNING");
    }

    await logActivity(
      data.id, invoice_num,
      hasConflict ? (useRefusal ? "Deposit-Ready Challenger" : noStandingLead ? "Lead — Date Held (No Standing)" : "Conflict Detected") : "Booking Created",
      hasConflict
        ? (useRefusal
            ? `Ready to commit. Holder ${holder?.contact_name ?? ""} given courtesy window to confirm.`
            : noStandingLead
              ? `Interested in a date held by ${holder?.contact_name ?? "another party"}, but not ready to commit — saved as a lead with no claim.`
              : `Conflicts with ${conflicts.length} event(s) — needs review`)
        : `Hold created, expires ${holdExpires.toLocaleString()}`,
      hasConflict ? "WARNING" : "SUCCESS"
    );
    if (!hasConflict) {
      await runActionAutomation("hold_confirmation", data);
    }
    await runActionAutomation("internal_new_booking", data);
    // Only a deposit-ready challenger sends the rep to the holder to act.
    await markDraftConverted(data.id);
    if (useRefusal && holder) { router.push(`/bookings/${holder.id}`); return; }
    router.push(`/bookings/${data.id}`);
  }


  /* ══════════ Inquiry Draft engine (v134) ══════════
   * Server-side autosave: every meaningful edit persists ~2s later.
   * The rep never thinks about saving; the CRM quietly remembers. */
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [chooser, setChooser] = useState<DraftRow[] | null>(null); // multiple drafts → pick
  const [restoredToast, setRestoredToast] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const bootRef = useRef(false);

  const estGuestsNum = estGuests ? Number(estGuests) : 0;
  const estimate = estGuestsNum > 0 ? {
    full_service: estGuestsNum * PRICING.FULL_SERVICE_PP,
    single_buffet: estGuestsNum * PRICING.BUFFET_SINGLE_PP,
    double_buffet: estGuestsNum * PRICING.BUFFET_DOUBLE_PP,
  } : null;

  // Section completion → progress. Contact needs name + a way to reach them;
  // Event needs type + date; Venue needs a room or an address; Guests a count.
  const secDone = {
    contact: !!(f.contact_name.trim() && (f.phone.trim() || f.email.trim())),
    event: !!(f.event_type && f.event_date),
    venue: locType === "on_prem" ? !!roomId : !!(place?.formatted || locName.trim()),
    guests: !!estGuests,
    notes: !!f.notes.trim(),
  };
  const progress = Math.round(
    ((secDone.contact ? 1 : 0) + (secDone.event ? 1 : 0) + (secDone.venue ? 1 : 0) +
     (secDone.guests ? 1 : 0) + (secDone.notes ? 1 : 0)) / 5 * 100);

  const draftPayload = useCallback(() => ({
    customer_name: f.contact_name.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null,
    contact2_name: f.contact2_name.trim() || null, contact2_phone: f.contact2_phone.trim() || null,
    contact2_email: f.contact2_email.trim() || null,
    event_type: f.event_type || null,
    celebrant_name: celName.trim() || null, celebrant_relation: celRelation || null,
    celebrant_age: celAge ? Number(celAge) : null,
    affiliation: affiliation.trim() || null,
    referral_channel: refChannel || null, referral_name: refName.trim() || null,
    event_date: f.event_date || null, start_time: f.event_time || null,
    duration: f.expected_hours || null, guest_count: estGuests || null,
    venue_type: locType, venue_room: locType === "on_prem" ? (roomId || null) : null,
    off_premise_location: locType === "off_prem" ? (place?.formatted || locName.trim() || null) : null,
    notes: f.notes.trim() || null,
    pricing_snapshot: estimate,
    last_autosaved: new Date().toISOString(), updated_at: new Date().toISOString(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [f, celName, celRelation, celAge, affiliation, refChannel, refName, estGuests, locType, roomId, locName, place, estimate]);

  const hasContent = !!(f.contact_name.trim() || f.phone.trim() || f.email.trim() || f.event_type || f.event_date || estGuests || f.notes.trim());

  async function flushDraft() {
    if (!dirtyRef.current || !hasContent) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) { setSaveState("offline"); return; }
    setSaveState("saving");
    const payload = draftPayload();
    if (draftId) {
      const { error } = await supabase.from("inquiry_drafts").update(payload).eq("id", draftId);
      if (error) { setErr(`Autosave failed: ${error.message} — run v134_inquiry_drafts.sql.`); setSaveState("idle"); return; }
    } else {
      const dn = "D-" + Date.now().toString(36).toUpperCase().slice(-5);
      const { data, error } = await supabase.from("inquiry_drafts")
        .insert({ ...payload, draft_number: dn, status: "draft" }).select("id").single();
      if (error || !data) { setErr(`Autosave failed: ${error?.message ?? "unknown"} — run v134_inquiry_drafts.sql.`); setSaveState("idle"); return; }
      setDraftId(data.id); setDraftNumber(dn);
    }
    dirtyRef.current = false;
    setLastSavedAt(new Date()); setSaveState("saved");
  }

  // Debounced autosave: any watched field marks dirty; flush ~2s after typing stops.
  useEffect(() => {
    if (!bootRef.current) return;           // don't save while restoring
    dirtyRef.current = true;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(flushDraft, 2000);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, celName, celRelation, celAge, affiliation, refChannel, refName, estGuests, locType, roomId, locName, place]);

  // When the connection returns, sync.
  useEffect(() => {
    const onUp = () => { if (dirtyRef.current) flushDraft(); };
    window.addEventListener("online", onUp);
    return () => window.removeEventListener("online", onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  function applyDraft(d: DraftRow) {
    setF((p) => ({ ...p,
      contact_name: d.customer_name ?? "", phone: d.phone ?? "", email: d.email ?? "",
      contact2_name: d.contact2_name ?? "", contact2_phone: d.contact2_phone ?? "", contact2_email: d.contact2_email ?? "",
      event_type: d.event_type ?? "", event_date: d.event_date ?? "", event_time: d.start_time ?? p.event_time,
      notes: d.notes ?? "", expected_hours: d.duration ?? "",
    }));
    if (d.contact2_name || d.contact2_phone) setShowContact2(true);
    setCelName(d.celebrant_name ?? ""); setCelRelation(d.celebrant_relation ?? "");
    setCelAge(d.celebrant_age != null ? String(d.celebrant_age) : "");
    setAffiliation(d.affiliation ?? ""); setRefChannel(d.referral_channel ?? ""); setRefName(d.referral_name ?? "");
    setEstGuests(d.guest_count ?? "");
    setLocType((d.venue_type as "on_prem" | "off_prem") ?? "on_prem");
    setRoomId(d.venue_room ?? "");
    setLocName(d.off_premise_location ?? "");
    setDraftId(d.id); setDraftNumber(d.draft_number);
    if (d.last_autosaved) setLastSavedAt(new Date(d.last_autosaved));
  }

  // Boot: ?draft=<id> opens that draft; one open draft auto-restores; several → chooser.
  useEffect(() => {
    (async () => {
      const want = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("draft") : null;
      const { data, error } = await supabase.from("inquiry_drafts").select("*")
        .eq("status", "draft").order("updated_at", { ascending: false });
      if (error) { bootRef.current = true; return; }   // table missing → behave like v132
      const drafts = (data ?? []) as DraftRow[];
      if (want) {
        const d = drafts.find((x) => x.id === want);
        if (d) { applyDraft(d); setRestoredToast(true); setTimeout(() => setRestoredToast(false), 3500); }
      } else if (drafts.length === 1) {
        applyDraft(drafts[0]); setRestoredToast(true); setTimeout(() => setRestoredToast(false), 3500);
      } else if (drafts.length > 1) {
        setChooser(drafts);
      }
      setTimeout(() => { bootRef.current = true; }, 300);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markDraftConverted(bookingId: string) {
    if (!draftId) return;
    await supabase.from("inquiry_drafts").update({
      status: "converted", converted_booking_id: bookingId,
      converted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", draftId);
  }

  function agoLabel(dt: Date | null): string {
    if (!dt) return "";
    const m = Math.floor((Date.now() - dt.getTime()) / 60000);
    if (m < 1) return "just now";
    if (m === 1) return "1 minute ago";
    if (m < 60) return `${m} minutes ago`;
    const h = Math.floor(m / 60);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }

  // Relationship Memory — rendered in the sidebar on xl, inline below it.
  const renderRelationshipMemory = (withId: boolean) => (
    <>
        {dupes.length > 0 && (
          <div id={withId ? "dupes-panel" : undefined} className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 text-sm text-amber-900">
            {memory && (
              <div className="rounded-lg bg-white ring-1 ring-amber-200 px-3.5 py-2.5 mb-2.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">📇 Sales memory{memory.tier ? ` · ${memory.tier}` : ""}</span>
                  {household[0] && (
                    <Link href={`/customers/${household.find((h) => h.id)?.id ?? ""}`} target="_blank"
                      className="text-[11px] font-semibold text-navy underline underline-offset-2">Open Customer Profile →</Link>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-1.5 mt-1.5 text-slate-700">
                  {memory.lastMenu && <div><span className="text-[10px] text-slate-400 block">Last menu</span><b className="text-xs">{memory.lastMenu}</b></div>}
                  {memory.favAddons.length > 0 && <div className="col-span-2"><span className="text-[10px] text-slate-400 block">Favorite add-ons</span><b className="text-xs">{memory.favAddons.map((a) => `✔ ${a}`).join("  ")}</b></div>}
                  {memory.avgGuests != null && <div><span className="text-[10px] text-slate-400 block">Typical guests</span><b className="text-xs">{memory.avgGuests}</b></div>}
                  {memory.favRoom && <div><span className="text-[10px] text-slate-400 block">Preferred room</span><b className="text-xs">{memory.favRoom}</b></div>}
                  <div><span className="text-[10px] text-slate-400 block">Lifetime</span><b className="text-xs">${Math.round(memory.lifetime).toLocaleString()}</b></div>
                </div>
              </div>
            )}
            <p className="font-bold mb-1">👥 This contact already has {dupes.length === 1 ? "a booking" : `${dupes.length} bookings`}</p>
            {dupes.slice(0, 4).map((d) => (
              <p key={d.id} className="text-xs">
                • <Link href={`/bookings/${d.id}`} className="underline" target="_blank">#{d.invoice_num} {d.contact_name}</Link>
                {" — "}{fmtDate(d.event_date)}{d.event_date === f.event_date ? " (SAME DATE — possible duplicate!)" : ""} · {stageFor(d.status).label}
              </p>
            ))}
            <p className="text-[11px] mt-1 text-amber-700">If this is the same request, open the existing booking instead of creating a double.</p>
          </div>
        )}
    </>
  );

  return (
    <div className="max-w-6xl">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight transition-all">
            {f.contact_name.trim() ? <>{f.contact_name.trim()} <span className="text-slate-300 font-normal">· Inquiry</span></> : "New Inquiry"}
            {draftNumber && <span className="ml-3 align-middle text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-1 bg-slate-100 text-slate-500">DRAFT {draftNumber}</span>}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Creates a 24-hour hold and assigns the next invoice number.</p>
          <div className="gold-rule mt-3" />
        </div>
        <div className="text-right text-[11px] text-slate-400 min-h-[2rem]">
          {saveState === "saving" && <span className="reveal">Saving…</span>}
          {saveState === "saved" && <span className="reveal text-emerald-600 font-semibold">✓ Saved</span>}
          {saveState === "offline" && <span className="reveal text-amber-600 font-semibold">Offline — will sync automatically</span>}
          {lastSavedAt && saveState !== "saving" && (
            <div className="mt-0.5">Last saved: {agoLabel(lastSavedAt)}</div>
          )}
        </div>
      </header>
      {restoredToast && (
        <p className="reveal rounded-lg bg-emerald-50 ring-1 ring-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-2 mb-4">
          ✓ Restored your unfinished inquiry.
        </p>
      )}
      {chooser && !draftId ? (
        <DraftChooser drafts={chooser}
          onPick={(d) => { applyDraft(d); setChooser(null); setRestoredToast(true); setTimeout(() => setRestoredToast(false), 3500); }}
          onNew={() => setChooser(null)}
          onDiscard={async (d) => {
            await supabase.from("inquiry_drafts").update({ status: "discarded", discarded_at: new Date().toISOString() }).eq("id", d.id);
            setChooser((prev) => prev ? prev.filter((x) => x.id !== d.id) : prev);
          }} />
      ) : (
      <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0">

      <div className="space-y-4">
        {/* Sticky alert strip: severity-tiered, stays visible while the issue
            exists. Red = clashes a CONFIRMED booking · blue = soft scheduling
            note (unconfirmed hold) · amber = duplicate customer. */}
        {(conflicts.length > 0 || dupes.length > 0) && (
          <div className="sticky top-2 z-30 space-y-1.5 -mx-2">
            {conflicts.length > 0 && (
              <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${
                confirmedClash
                  ? "bg-red-600 text-white"
                  : "bg-sky-50 text-sky-900 ring-1 ring-sky-200"
              }`}>
                <span>{confirmedClash ? "⚠️ Booking conflict detected — clashes a confirmed booking" : "ℹ️ Scheduling note — this time overlaps an unconfirmed hold"}</span>
                <button type="button" onClick={() => jumpTo("conflict-panel")}
                  className={`text-xs underline underline-offset-2 whitespace-nowrap ${confirmedClash ? "text-white/90 hover:text-white" : "text-sky-700 hover:text-sky-900"}`}>
                  Review details ↓
                </button>
              </div>
            )}
            {dupes.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold bg-amber-100 text-amber-900 ring-1 ring-amber-300 shadow-lg">
                <span>👥 This contact already has {dupes.length === 1 ? "a booking" : "bookings"} on file</span>
                <button type="button" onClick={() => jumpTo("dupes-panel")}
                  className="text-xs underline underline-offset-2 text-amber-800 hover:text-amber-950 whitespace-nowrap">
                  Review details ↓
                </button>
              </div>
            )}
          </div>
        )}
        {/* 1 — Customer */}
        <IntakeCard icon="👤" tile="bg-[#EEEBFB] text-[#6B4E9E]" title="Contact Information" done={secDone.contact}
          summary={`${f.contact_name}${f.phone ? ` · ${f.phone}` : f.email ? ` · ${f.email}` : ""}`}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Customer name *</label>
            <input className="field" value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></div>
          <div><label className="label">Phone</label>
            <input className="field" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 555-5555" /></div>
          <div><label className="label">Email</label>
            <input className="field" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><label className="label">Shul / school / community <span className="text-slate-300">(optional)</span></label>
            <input className="field" placeholder="e.g. Khal Bnei Torah, Bais Yaakov of Lakewood"
              value={affiliation} onChange={(e) => setAffiliation(e.target.value)} /></div>
          <div><label className="label">How did you hear about us? <span className="text-slate-300">(optional)</span></label>
            <div className="flex gap-2">
              <select className="field" value={refChannel} onChange={(e) => setRefChannel(e.target.value)}>
                <option value="">— Select —</option>
                <option>Referral</option>
                <option>Repeat customer</option>
                <option>Google</option>
                <option>Instagram / Facebook</option>
                <option>Drove by / local</option>
                <option>Other</option>
              </select>
              {refChannel === "Referral" && (
                <input className="field reveal" placeholder="Referred by…" value={refName} onChange={(e) => setRefName(e.target.value)} />
              )}
            </div></div>

          {/* Optional second contact — hidden until needed (e.g. spouse, event planner) */}
          {!showContact2 ? (
            <div className="sm:col-span-2">
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors" onClick={() => setShowContact2(true)}>
                ➕ Secondary Contact
              </button>
            </div>
          ) : (
            <>
              <div ref={c2Ref} className="sm:col-span-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Second contact</span>
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-white hover:bg-navy/5 border border-slate-200 rounded-full px-3 py-1 transition-colors"
                  onClick={() => { setShowContact2(false); set("contact2_name", ""); set("contact2_phone", ""); set("contact2_email", ""); }}>
                  − Remove Secondary Contact
                </button>
              </div>
              <div><label className="label">Name</label>
                <input className="field" value={f.contact2_name} onChange={(e) => set("contact2_name", e.target.value)} /></div>
              <div><label className="label">Phone</label>
                <input className="field" value={f.contact2_phone} onChange={(e) => set("contact2_phone", e.target.value)} /></div>
              <div><label className="label">Email</label>
                <input className="field" type="email" value={f.contact2_email} onChange={(e) => set("contact2_email", e.target.value)} /></div>
            </>
          )}
        </div>
        </IntakeCard>

        <IntakeCard icon="📅" tile="bg-[#E4EEF9] text-[#3D6488]" title="Event Details" done={secDone.event && secDone.venue && secDone.guests}
          summary={[f.event_type, f.event_date ? fmtDate(f.event_date) : "", estGuests ? `${estGuests} guests` : ""].filter(Boolean).join(" · ")}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Event type</label>
            <select className="field" value={f.event_type} onChange={(e) => set("event_type", e.target.value)}>
              <option value="">— Select —</option>
              {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select></div>
          <div className="sm:col-span-2"><label className="label">Who&rsquo;s the simcha for? <span className="text-slate-300">(optional)</span></label>
            <div className="flex gap-2 flex-wrap">
              <input className="field flex-1 min-w-[140px]" placeholder="Name" value={celName} onChange={(e) => setCelName(e.target.value)} />
              <select className="field w-36" value={celRelation} onChange={(e) => setCelRelation(e.target.value)}>
                <option value="">Relation…</option>
                <option>Son</option><option>Daughter</option>
                <option>Grandson</option><option>Granddaughter</option>
                <option>Self</option><option>Sibling</option>
                <option>Parent</option><option>Other</option>
              </select>
              <input className="field w-20" type="number" min="0" max="120" placeholder="Age" value={celAge} onChange={(e) => setCelAge(e.target.value)} />
            </div></div>
          <div><label className="label">Event date</label>
            <input className="field" type="date" value={f.event_date} onChange={(e) => set("event_date", e.target.value)} /></div>
          <div><label className="label">Start time</label>
            <select className="field" value={f.event_time} onChange={(e) => set("event_time", e.target.value)}>
              {TIMES.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
            </select></div>
          <div><label className="label">Expected duration (hrs)</label>
            <input className="field" type="number" step="0.5" min="0" value={f.expected_hours}
              onChange={(e) => set("expected_hours", e.target.value)}
              placeholder={pol ? String(pol.default_event_hours) : "4"} />
            <p className="text-[11px] text-slate-400 mt-1">Leave blank for standard. A shorter event may fit alongside another.</p>
          </div>
          <div><label className="label">Estimated guests</label>
            <input className="field" type="number" min="0" value={estGuests}
              onChange={(e) => setEstGuests(e.target.value)} placeholder="rough count" />
            {(() => {
              const room = rooms.find((r) => r.id === roomId);
              if (locType === "on_prem" && room?.guest_capacity && estGuests && Number(estGuests) > room.guest_capacity)
                return <p className="text-[11px] text-red-600 mt-1 font-semibold">⚠️ {room.name} seats {room.guest_capacity} — estimate is {estGuests}.</p>;
              return null;
            })()}
          </div>

          {/* WHERE is the first decision — a booking KIND, not a room pick.
              Radio only appears when off-prem is enabled; otherwise a plain
              room select (only when there's more than one room). */}
          <p className="sm:col-span-2 text-[9px] text-slate-300 -mb-3">
            loc-debug: mode={locMode} · activeRooms={rooms.length} · offPrem={offOn ? "on" : "off"}
          </p>
          {locMode === "none" && (
            <div className="sm:col-span-2 rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 text-sm text-amber-900">
              <b>⚠️ No bookable locations configured.</b> Every room is inactive and off-premise is disabled — add a room or enable off-premise in <b>Locations &amp; Capacity</b>. Reserving is disabled until then (you can still save a lead).
            </div>
          )}
          {locMode === "choice" ? (
            <div className="sm:col-span-2">
              <label className="label">Where is this event being held?</label>
              <div className="flex gap-5 flex-wrap mt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" className="accent-navy" checked={locType === "on_prem"}
                    onChange={() => setLocType("on_prem")} />
                  🏛️ At one of our venues
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" className="accent-navy" checked={locType === "off_prem"}
                    onChange={() => setLocType("off_prem")} />
                  📍 Off-premise catering
                </label>
              </div>
            </div>
          ) : null}
          {locType === "on_prem" && rooms.length > 1 && (
            <div className="reveal"><label className="label">Room *</label>
              <select className="field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {rooms.map((r) => <option key={r.id} value={r.id}>🏛️ {r.name}{r.guest_capacity ? ` (seats ${r.guest_capacity})` : ""}</option>)}
              </select></div>
          )}
          {locType === "off_prem" && (
            <div className="sm:col-span-2 grid sm:grid-cols-2 gap-4 rounded-xl bg-slate-50 ring-1 ring-slate-100 p-4 reveal">
              <div className="sm:col-span-2"><label className="label">📍 Event address *</label>
                <AddressAutocomplete value={addrLine} onChange={setPlace} id="offprem-addr" />
                {place?.source === "places" && place.lat && (
                  <p className="text-[10px] text-emerald-600 mt-1">✓ Address verified &amp; geocoded{place.city ? ` — ${place.city}${place.state ? `, ${place.state}` : ""}` : ""}</p>
                )}
              </div>
              <div className="sm:col-span-2"><label className="label">Location name <span className="text-slate-300">(optional)</span></label>
                <input className="field" value={locName} onChange={(e) => setLocName(e.target.value)}
                  placeholder="e.g. Bais Yaakov Ballroom · Mr. Cohen Residence" /></div>
              <div className="sm:col-span-2"><label className="label">Travel impact</label>
                <div className="flex gap-4 flex-wrap mt-1">
                  {([["normal", "Normal"], ["heavy", "Extra travel"], ["vheavy", "Significant travel"]] as const).map(([v, lbl]) => (
                    <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="radio" className="accent-navy" checked={wtLoad === v} onChange={() => setWtLoad(v)} />
                      {lbl}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        </IntakeCard>

        <IntakeCard icon="📝" tile="bg-[#F5EEDD] text-[#8A6534]" title="Additional Notes" done={secDone.notes}
          summary={f.notes.length > 64 ? f.notes.slice(0, 61) + "…" : f.notes}>
          <textarea className="field" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering from the conversation…" />
        </IntakeCard>

        <div className="xl:hidden">{dupes.length > 0 && renderRelationshipMemory(true)}</div>

        {f.event_date && (
          conflicts.length === 0 ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 font-medium">
              ✅ Available — no overlapping events for this time and duration
              {f.expected_hours && Number(f.expected_hours) < (pol?.default_event_hours ?? 4) && (
                <span className="block text-xs font-normal mt-0.5">
                  A {f.expected_hours}-hr event fits here even though a full-length one wouldn&apos;t. 🔀
                </span>
              )}
            </div>
          ) : (
            <div id="conflict-panel" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              <p className="font-bold mb-1">⚠️ Time conflict on this date</p>
              {conflicts.map((c) => {
                const isBooked = !["on_hold", "conflict", "waitlisted", "hold_expired"].includes(c.status);
                return (
                  <p key={c.id}>
                    • #{c.invoice_num} {c.contact_name} at {fmtTime(c.event_time)} —{" "}
                    <span className={isBooked ? "font-bold" : "font-medium"}>
                      {isBooked ? "CONFIRMED BOOKING" : "hold (unconfirmed)"}
                    </span>
                  </p>
                );
              })}
              <p className="mt-1 text-xs">
                {conflicts.some((c) => !["on_hold", "conflict", "waitlisted", "hold_expired"].includes(c.status))
                  ? "A confirmed booking holds this slot — the date is taken for a full-length event."
                  : "Held by an unconfirmed party — first right of refusal may apply per your policy."}
              </p>

              {/* Squeeze-in prompt: a shorter event may still fit around existing
                  bookings. Offered whenever there's a conflict and the rep hasn't
                  already entered a short duration that clears it. */}
              {pol && (() => {
                // Compute the viable start time for shorter service lengths so the rep
                // sees a concrete answer, not just "try a number". For each candidate
                // service length, the latest start that clears the EARLIEST conflicting
                // event before it = conflictStart − changeover − serviceLength.
                const changeMin = changeoverMinutes(pol);
                const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
                const fmtMin = (mins: number) => {
                  if (mins < 0) return null;
                  let h = Math.floor(mins / 60); const m = mins % 60;
                  const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
                  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
                };
                // Earliest conflicting event start (the one we must finish before).
                const earliest = conflicts
                  .map((c) => (c.event_time ? toMin(c.event_time) : null))
                  .filter((x): x is number => x !== null)
                  .sort((a, b) => a - b)[0];
                const candidates = [1, 1.5, 2, pol.service_hours].filter((v, i, a) => a.indexOf(v) === i && v <= pol.service_hours);
                return (
                  <div className="mt-3 rounded-lg bg-white border border-blue-300 px-3 py-2.5 text-slate-700">
                    <p className="text-xs font-semibold text-blue-800 mb-1">🔀 Fit a shorter event before this slot?</p>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Standard service is {pol.service_hours} hrs. Between events you need {(changeMin / 60).toFixed(1)} hr changeover (setup {pol.setup_hours}h + bussing {pol.bussing_hours}h − {pol.changeover_overlap_hours}h overlap). A shorter service can start later and still clear the next event:
                    </p>
                    {earliest != null && (
                      <div className="space-y-1">
                        {candidates.map((svc) => {
                          const latestStart = earliest - changeMin - svc * 60;
                          // Snap DOWN to the half-hour grid only when needed — a true
                          // 2:30 PM latest start displays as 2:30 PM, not 2:00 PM.
                          const snapped = Math.floor(latestStart / 30) * 30;
                          const label = fmtMin(snapped);
                          return (
                            <div key={svc} className="flex items-center justify-between text-xs">
                              <span>{svc}-hr service →{" "}
                                {label ? <>can start as late as <b>{label}</b></> : <span className="text-red-600">doesn&apos;t fit before this event</span>}
                              </span>
                              {label && (
                                <button type="button" className="rounded-full border border-blue-300 px-2.5 py-0.5 hover:bg-blue-50"
                                  onClick={() => { set("expected_hours", String(svc)); set("event_time", `${String(Math.floor(snapped / 60)).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`); }}>
                                  Use {label}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Deposit-readiness gate: only an unconfirmed holder under first-refusal
                  policy. This party can only challenge the hold if ready to commit. */}
              {pol?.conflict_mode === "first_refusal" &&
               conflicts.some((c) => c.status === "on_hold" || c.status === "conflict") &&
               !conflicts.some((c) => !["on_hold", "conflict", "waitlisted", "hold_expired"].includes(c.status)) && (
                <div className="mt-3 rounded-lg bg-white border border-amber-300 px-3 py-2.5 text-slate-700">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={!!f.deposit_ready}
                      onChange={(e) => set("deposit_ready", e.target.checked ? "1" : "")} />
                    <span className="text-xs">
                      <b>This party is ready to commit now (card secured).</b> Only then do we
                      contact the current holder and give them their courtesy window. If left
                      unchecked, this inquiry is saved as a lead with no claim on the date.
                    </span>
                  </label>
                  {f.deposit_ready && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-xs text-slate-500">Card last 4 (reference only):</label>
                      <input className="field !py-1 w-24 text-sm" maxLength={4} inputMode="numeric"
                        placeholder="1234" value={f.card_last4}
                        onChange={(e) => set("card_last4", e.target.value.replace(/\D/g, "").slice(0, 4))} />
                    </div>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    We never store the full card number — only the last 4 for your reference. Collect/charge the card through your processor as usual.
                  </p>
                </div>
              )}
            </div>
          )
        )}

        {err && <p className="text-sm text-red-600 font-medium">{err}</p>}

        {cap && (
          <div className={`rounded-lg px-4 py-3 text-sm ${cap.over ? "bg-red-50 border border-red-200 text-red-800" : "bg-slate-50 ring-1 ring-slate-100 text-slate-600"}`}>
            <p className="font-semibold">
              🏭 Production capacity {fmtDate(f.event_date)}: {cap.used} of {cap.total} points used · this job +{cap.mine}
            </p>
            {cap.over && (
              <>
                <p className="text-xs mt-0.5">Booking this would put the day at {cap.used + cap.mine}/{cap.total} — over your kitchen/crew capacity.</p>
                <label className="flex items-center gap-2 mt-2 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" checked={capOverride} onChange={(e) => setCapOverride(e.target.checked)} />
                  Book anyway (I know we can produce it)
                </label>
              </>
            )}
          </div>
        )}

        {/* Three intents, three weights: reserving a date (primary), coming to
            see the room (outlined), or just staying in touch (text). The first
            claims the date; the other two create an L-series lead. */}
        <div id="primary-ctas" className="card p-5 space-y-4">
        <div className="flex gap-3 pt-1 flex-wrap items-center">
          <button onClick={createBooking} disabled={saving || locMode === "none"}
            title={locMode === "none" ? "No bookable locations — configure Locations & Capacity first" : undefined}
            className="btn-primary flex-1 min-w-[180px] disabled:opacity-50">
            {saving ? "Working…" : conflicts.length > 0 ? "Reserve Date — Conflict (review)" : "Reserve Date (24-Hour Hold)"}
          </button>
          <button onClick={() => setShowWalkthrough((v) => !v)} disabled={saving}
            className="flex-1 min-w-[180px] rounded-xl border-2 border-navy text-navy font-semibold py-2.5 px-4 hover:bg-navy/5 transition-colors">
            🚶 Schedule Walkthrough
          </button>
          <button onClick={() => createLead(false)} disabled={saving}
            className="text-sm font-semibold text-slate-500 hover:text-navy underline underline-offset-2 px-2">
            Save as Lead
          </button>
        </div>

        {showWalkthrough && (
          <div ref={wtRef} className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-4 space-y-3">
            <p className="text-xs text-slate-500">
              Creates a <b>lead</b> (L-number — no hold, no invoice) with the walkthrough on the calendar. The date above is optional and stays an estimate.
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className="label">Walkthrough date & time *</label>
                <input className="field" type="datetime-local" value={wtWhen} onChange={(e) => setWtWhen(e.target.value)} /></div>
              <div><label className="label">Salesperson</label>
                <select className="field" value={wtAssignee} onChange={(e) => setWtAssignee(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {staff.map((st) => <option key={st.id} value={st.name}>{st.name}</option>)}
                </select></div>
              <div><label className="label">Notes</label>
                <input className="field" value={wtNotes} onChange={(e) => setWtNotes(e.target.value)} placeholder="e.g. wants to see the hall set for 150" /></div>
            </div>
            <button onClick={() => createLead(true)} disabled={saving} className="btn-primary !py-2">
              {saving ? "Working…" : "Create Lead + Schedule Walkthrough"}
            </button>
          </div>
        )}
        </div>
      </div>

      <div className="card p-6 mt-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-display font-bold text-sm">💰 Quick pricing reference</h2>
          <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setShowEmailMenus((s) => !s)}>
            📧 Email menus to customer
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mb-3">Tap a package for how to present it to the customer.</p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {[
            { key: "full_service", icon: "🍽️", label: "Full Service Plated", price: PRICING.FULL_SERVICE_PP },
            { key: "single_buffet", icon: "🥘", label: "Single Buffet", price: PRICING.BUFFET_SINGLE_PP },
            { key: "double_buffet", icon: "🥘🥘", label: "Double Buffet", price: PRICING.BUFFET_DOUBLE_PP },
          ].map((p) => {
            const guide = guides.find((g) => g.key === p.key);
            const isOpen = openGuide === p.key;
            return (
              <div key={p.key} className="rounded-lg bg-goldsoft overflow-hidden">
                <button className="w-full text-left p-3 hover:bg-gold/10 transition-colors"
                  onClick={() => setOpenGuide(isOpen ? null : p.key)}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.icon} {p.label}</span>
                    <span className="text-[11px] text-navy font-semibold">{isOpen ? "Hide ▲" : "How to sell ▼"}</span>
                  </div>
                  <div className="text-navy font-display font-bold text-lg">${p.price}<span className="text-xs text-slate-500 font-body">/person</span></div>
                </button>
                {isOpen && guide && (
                  <div className="px-3 pb-3 pt-1 space-y-2 text-xs border-t border-gold/30">
                    {guide.price_label && <p className="text-slate-500">{guide.price_label}</p>}
                    {guide.includes && <div><b className="text-ink">Includes:</b> <span className="text-slate-600">{guide.includes}</span></div>}
                    {guide.best_for && <div><b className="text-ink">Best for:</b> <span className="text-slate-600">{guide.best_for}</span></div>}
                    {guide.talk_track && <div><b className="text-ink">How to present:</b> <span className="text-slate-600">{guide.talk_track}</span></div>}
                    {guide.upsells && <div><b className="text-ink">Upsells:</b> <span className="text-slate-600">{guide.upsells}</span></div>}
                  </div>
                )}
                {isOpen && !guide && (
                  <div className="px-3 pb-3 text-xs text-slate-400">No guide yet — add one in Back Office → Package Guides.</div>
                )}
              </div>
            );
          })}
          <div className="rounded-lg bg-goldsoft p-3">
            <div className="font-semibold">Key extras</div>
            <div className="text-xs text-slate-600 mt-1 leading-relaxed">
              Children ${PRICING.BUFFET_CHILDREN_PP} · Dessert station ${PRICING.BUFFET_DESSERT_STATION_PP}/pp · Deposit ${PRICING.DEPOSIT_AMOUNT}
            </div>
          </div>
        </div>

        {showEmailMenus && <EmailMenusPanel defaultEmail={f.email} contactName={f.contact_name} />}

        <p className="text-[11px] text-slate-400 mt-3">Prices subject to 6.625% NJ sales tax. Credit card payments add a 3% processing fee.</p>
      </div>
      </div>

      {/* ═══ The concierge sidebar: what do we know · can we book it ·
          what's it worth · who are they · what happens next ═══ */}
      <aside className="hidden xl:block w-[340px] shrink-0">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 space-y-3">

          {/* Inquiry Snapshot — assembles live as the rep types */}
          <div className="rounded-2xl p-4 text-white shadow-[0_8px_24px_rgba(16,42,67,0.28)]" style={{ background: "#102A43" }}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-2">Inquiry Snapshot</div>
            {!hasContent ? (
              <p className="text-[13px] text-white/50 leading-relaxed">Start the conversation — the summary builds itself as you type.</p>
            ) : (
              <div className="space-y-1">
                <div className="text-[17px] font-display font-bold leading-tight">{f.contact_name || "—"}</div>
                <div className="text-[13px] text-white/80">
                  {[f.event_type, celName && `for ${celName}`].filter(Boolean).join(" ")}
                </div>
                <div className="text-[13px] text-white/80">
                  {f.event_date ? fmtDate(f.event_date) : "No date yet"}{f.event_time ? ` · ${fmtTime(f.event_time)}` : ""}
                </div>
                <div className="text-[13px] text-white/80">
                  {[estGuests && `${estGuests} guests`,
                    locType === "on_prem"
                      ? (rooms.find((r) => r.id === roomId)?.name ?? null)
                      : (place?.formatted || locName || "Off-premise")].filter(Boolean).join(" · ") || " "}
                </div>
                {memory && memory.tier && (
                  <div className="inline-flex items-center gap-1 rounded-full bg-gold/20 text-gold px-2 py-0.5 text-[11px] font-semibold mt-1 reveal">
                    ★ {memory.tier}
                  </div>
                )}
                {estimate && (
                  <div className="text-[13px] text-white/90 pt-1">
                    <span className="text-white/50">Est. revenue</span> <b className="font-display">~${estimate.full_service.toLocaleString()}</b>
                  </div>
                )}
                <div className="pt-2">
                  <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                    <div className="h-full rounded-full bg-gold transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="text-[10px] text-white/40 mt-1">{progress}% complete</div>
                </div>
              </div>
            )}
          </div>

          {/* Availability — runs continuously, never waits for Reserve */}
          <div className={`rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] ring-1 ${!f.event_date ? "bg-white ring-[#E6EAF2]" : conflicts.length === 0 ? "bg-[#F0FAF4] ring-emerald-200" : confirmedClash ? "bg-red-50 ring-red-200" : "bg-amber-50 ring-amber-200"}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Availability</div>
              <Link href="/calendar" className="text-[11px] text-navy hover:underline font-medium">View Calendar</Link>
            </div>
            {!f.event_date ? (
              <p className="text-[13px] text-slate-400">Pick a date and the calendar answers instantly.</p>
            ) : (
              <div className="space-y-2">
                {conflicts.length === 0 ? (
                  <p className="text-[15px] font-semibold text-emerald-700">✓ Available</p>
                ) : confirmedClash ? (
                  <button className="text-left" onClick={() => jumpTo("conflict-panel")}>
                    <p className="text-[15px] font-semibold text-red-700">⛔ Unavailable</p>
                    <p className="text-[11px] text-red-500 underline">Clashes a confirmed booking — review</p>
                  </button>
                ) : (
                  <button className="text-left" onClick={() => jumpTo("conflict-panel")}>
                    <p className="text-[15px] font-semibold text-amber-700">⚠️ Possible conflict</p>
                    <p className="text-[11px] text-amber-600 underline">Unconfirmed hold — review options</p>
                  </button>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] pt-1 border-t border-black/5">
                  {chosenRoom && (
                    <><span className="text-slate-400">Room</span><span className="text-right font-medium text-slate-600">{chosenRoom.name}</span></>
                  )}
                  {capLabel && (
                    <><span className="text-slate-400">Kitchen load</span>
                      <span className={`text-right font-medium ${capLabel === "Over capacity" ? "text-red-600" : capLabel === "Heavy" ? "text-amber-600" : "text-slate-600"}`}>{capLabel}</span></>
                  )}
                  <><span className="text-slate-400">Nearby events</span><span className="text-right font-medium text-slate-600">{nearbyCount}</span></>
                  {roomFits != null && (
                    <><span className="text-slate-400">Room fit</span>
                      <span className={`text-right font-medium ${roomFits ? "text-emerald-600" : "text-red-600"}`}>{roomFits ? "Comfortable" : "Tight"}</span></>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Estimated value — guest count × package rates. Never a quote. */}
          <div className="rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] ring-1 bg-[#FFFBF2] ring-[#F3E3BE]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#9C7A2E] mb-1.5">Estimated Value</div>
            {!estimate ? (
              <p className="text-[13px] text-slate-400">Enter a guest count for a ballpark by package.</p>
            ) : (
              <div className="space-y-1 text-[13px]">
                <div className="flex justify-between"><span className="text-slate-600">Full Service</span><b className="font-display">~${estimate.full_service.toLocaleString()}</b></div>
                <div className="flex justify-between"><span className="text-slate-600">Single Buffet</span><b className="font-display">~${estimate.single_buffet.toLocaleString()}</b></div>
                <div className="flex justify-between"><span className="text-slate-600">Double Buffet</span><b className="font-display">~${estimate.double_buffet.toLocaleString()}</b></div>
                <p className="text-[10px] text-[#9C7A2E]/70 pt-1">Estimate only — before add-ons, tax, and minimums.</p>
              </div>
            )}
          </div>

          {/* Relationship Memory — real household stats, the concierge whisper */}
          {memory ? (
            <div className="rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] ring-1 bg-[#F4F7FC] ring-[#D6E2F2]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#3D6488] mb-1.5">Relationship Memory</div>
              {memory.tier && <div className="text-[15px] font-display font-bold text-navy leading-tight">★ {memory.tier}</div>}
              <div className="text-[12px] text-slate-500 mb-2">
                {memory.since ? `Customer since ${memory.since}` : "Returning customer"}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                <span className="text-slate-400">Events</span><span className="text-right font-medium">{memory.events}</span>
                <span className="text-slate-400">Lifetime</span><span className="text-right font-medium">${memory.lifetime.toLocaleString()}</span>
                {memory.avgGuests != null && (<><span className="text-slate-400">Avg guests</span><span className="text-right font-medium">{memory.avgGuests}</span></>)}
                {memory.outstanding > 0 && (<><span className="text-slate-400">Open balance</span><span className="text-right font-medium text-amber-600">${memory.outstanding.toLocaleString()}</span></>)}
                {memory.favMenu && (<><span className="text-slate-400">Favorite menu</span><span className="text-right font-medium truncate">{memory.favMenu}</span></>)}
                {memory.favRoom && (<><span className="text-slate-400">Favorite room</span><span className="text-right font-medium truncate">{memory.favRoom}</span></>)}
              </div>
              {household[0] && (
                <a href={`/customers/${household[0].id}`} target="_blank" rel="noopener"
                  className="inline-block text-[11px] text-navy hover:underline font-medium mt-2">View customer →</a>
              )}
              {dupes.length > 0 && (
                <button className="block text-[11px] text-amber-600 hover:underline mt-1" onClick={() => jumpTo("dupes-panel")}>
                  ⚠️ Possible duplicate — review
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] ring-1 bg-white ring-[#E6EAF2]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Relationship Memory</div>
              <p className="text-[13px] text-slate-400 leading-relaxed">
                {f.phone.trim() || f.email.trim()
                  ? "New contact — no history on file yet."
                  : "Enter a phone or email and any household history appears here."}
              </p>
            </div>
          )}

          {/* Next Steps — the software recommends, then lists alternatives */}
          <div className="rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] ring-1 bg-white ring-[#E6EAF2]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Next Steps</div>
            {recommendation && (
              <button className={`w-full text-left rounded-xl p-3 mb-2.5 ring-1 transition-all reveal ${recommendation.tone === "go" ? "bg-[#F0FAF4] ring-emerald-200 hover:ring-emerald-400" : "bg-amber-50 ring-amber-200 hover:ring-amber-400"}`}
                onClick={() => jumpTo("primary-ctas")}>
                <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${recommendation.tone === "go" ? "text-emerald-600" : "text-amber-600"}`}>★ Recommended</div>
                <div className="font-display font-bold text-[15px] text-ink">{recommendation.action}</div>
                <ul className="mt-1 space-y-0.5">
                  {recommendation.reasons.map((r, i) => (
                    <li key={i} className="text-[11px] text-slate-500 flex items-start gap-1">
                      <span className={recommendation.tone === "go" ? "text-emerald-500" : "text-amber-500"}>·</span>{r}
                    </li>
                  ))}
                </ul>
              </button>
            )}
            <div className="space-y-1.5 text-[13px]">
              <button className="flex items-center gap-2 w-full text-left group" onClick={() => jumpTo("primary-ctas")}>
                <span className="text-slate-300">☐</span>
                <span className="group-hover:text-navy font-medium">Create 24-hour hold</span>
              </button>
              <button className="flex items-center gap-2 w-full text-left group"
                onClick={() => { setShowWalkthrough(true); jumpTo("primary-ctas"); }}>
                <span className="text-slate-300">☐</span>
                <span className="group-hover:text-navy font-medium">Schedule walkthrough</span>
              </button>
              <button className="flex items-center gap-2 w-full text-left group"
                onClick={() => { setShowEmailMenus(true); setTimeout(() => jumpTo("primary-ctas"), 50); }}>
                <span className="text-slate-300">☐</span>
                <span className="group-hover:text-navy font-medium">Email menus</span>
              </button>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-slate-300">☐</span><span>Follow up tomorrow</span>
              </div>
            </div>
          </div>

        </div>
      </aside>
      </div>
      )}
    </div>
  );

}

// ─── Pre-hold "email menus" panel (works without a booking) ───
function EmailMenusPanel({ defaultEmail, contactName }: { defaultEmail: string; contactName: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [which, setWhich] = useState<"both" | "full_service" | "buffet">("both");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (defaultEmail) setEmail(defaultEmail); }, [defaultEmail]);

  async function send() {
    setResult(null);
    if (!email.trim()) { setResult({ ok: false, text: "Enter an email address." }); return; }
    setBusy(true);
    const links: string[] = [];
    if (which === "both" || which === "full_service") links.push(`📄 Full Service Menu: ${FULL_SERVICE_MENU}`);
    if (which === "both" || which === "buffet") links.push(`📄 Buffet Menu: ${BUFFET_MENU}`);
    const text =
      `Dear ${contactName || "there"},\n\n` +
      `Thank you for your interest in Event Space by Burger Bar! ` +
      `As requested, here ${links.length > 1 ? "are our menus" : "is our menu"}:\n\n` +
      links.join("\n") + `\n\n` +
      `Our packages start at $60 per person (40 guest minimum). When you're ready to ` +
      `reserve your date, a $500 deposit secures it.\n\n` +
      `Questions? Call us at ${BUSINESS_PHONE} — we're happy to help.\n\n` +
      `We hope to celebrate with you!\n\nEvent Space by Burger Bar`;
    const res = await sendEmail({
      to: email.trim(),
      subject: "Our menus — Event Space by Burger Bar",
      text,
      action: "Pre-Hold Menus Emailed",
    });
    setBusy(false);
    setResult(res.ok ? { ok: true, text: `Sent ✓ ${res.detail}` } : { ok: false, text: res.detail });
  }

  return (
    <div className="mt-4 rounded-xl bg-white border border-slate-200 p-4">
      <h3 className="font-display font-bold text-sm mb-1">📧 Email menus before a hold</h3>
      <p className="text-xs text-slate-500 mb-3">For an interested customer who wants to see the menus first. No booking needed.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Send to</label>
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
        </div>
        <div>
          <label className="label">Which menu(s)?</label>
          <select className="field" value={which} onChange={(e) => setWhich(e.target.value as "both" | "full_service" | "buffet")}>
            <option value="both">Both menus</option>
            <option value="full_service">Full Service only</option>
            <option value="buffet">Buffet only</option>
          </select>
        </div>
      </div>
      {result && <p className={`text-sm mt-2 font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}>{result.text}</p>}
      <button onClick={send} disabled={busy} className="btn-primary mt-3 w-full">{busy ? "Sending…" : "Send Menus"}</button>
    </div>
  );
}

/** Concierge intake card: expands while working, collapses to a one-line
 *  ✓ summary once complete. Top-level (never nested) so children keep focus. */
function IntakeCard({ icon, tile, title, done, summary, children }: {
  icon: string; tile: string; title: string; done: boolean; summary: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const wasDone = useRef(false);
  useEffect(() => {
    // Auto-collapse the moment a section becomes complete — but never while
    // the rep is still typing inside it.
    if (done && !wasDone.current) {
      const el = boxRef.current;
      if (!el || !el.contains(document.activeElement)) setOpen(false);
    }
    if (!done) setOpen(true);
    wasDone.current = done;
  }, [done]);
  return (
    <div ref={boxRef}
      className="rounded-2xl bg-white shadow-[0_4px_18px_rgba(15,23,42,0.06)] ring-1 ring-[#E6ECF3] transition-all"
      onBlurCapture={(e) => {
        if (done && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}>
      {open ? (
        <div className="px-5 py-4 reveal">
          <div className="flex items-center gap-2.5 mb-3.5">
            <span className={`grid place-items-center w-8 h-8 rounded-xl text-[15px] ${tile}`}>{icon}</span>
            <h2 className="font-display font-semibold text-[16px]">{title}</h2>
            {done && <span className="text-emerald-500 text-sm">✓</span>}
          </div>
          {children}
        </div>
      ) : (
        <button className="w-full flex items-center gap-2.5 px-4 py-3 text-left group" onClick={() => setOpen(true)}>
          <span className={`grid place-items-center w-6 h-6 rounded-lg text-[12px] ${tile}`}>{icon}</span>
          <span className="text-emerald-500 font-bold text-xs">✓</span>
          <span className="font-display font-semibold text-[14px]">{title}</span>
          <span className="text-[13px] text-slate-500 truncate flex-1 min-w-0">{summary}</span>
          <span className="text-[12px] text-navy opacity-0 group-hover:opacity-100 transition-opacity font-medium shrink-0">Edit</span>
        </button>
      )}
    </div>
  );
}

/** Several unfinished conversations → choose one, or start fresh. */
function DraftChooser({ drafts, onPick, onNew, onDiscard }: {
  drafts: DraftRow[]; onPick: (d: DraftRow) => void; onNew: () => void; onDiscard: (d: DraftRow) => void;
}) {
  function ago(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return `${Math.max(1, m)}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
  function pct(d: DraftRow) {
    const done = [
      !!(d.customer_name && (d.phone || d.email)),
      !!(d.event_type && d.event_date),
      d.venue_type === "off_prem" ? !!d.off_premise_location : !!d.venue_room,
      !!d.guest_count, !!d.notes,
    ].filter(Boolean).length;
    return Math.round((done / 5) * 100);
  }
  return (
    <div className="max-w-2xl">
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg mb-1">Continue a conversation?</h2>
        <p className="text-sm text-slate-500 mb-4">You have {drafts.length} unfinished inquiries.</p>
        <div className="space-y-2.5">
          {drafts.map((d) => (
            <div key={d.id} className="rounded-xl ring-1 ring-[#E6ECF3] p-3.5 flex items-center gap-3 hover:ring-navy/30 transition-all">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[15px]">{d.customer_name || "Unnamed inquiry"}</div>
                <div className="text-[12px] text-slate-500">
                  {[d.event_type, d.event_date ? fmtDate(d.event_date) : null, d.guest_count ? `${d.guest_count} guests` : null].filter(Boolean).join(" · ") || "Just started"}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="h-1 w-24 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-gold rounded-full" style={{ width: `${pct(d)}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-400">{pct(d)}% · {ago(d.updated_at)}</span>
                </div>
              </div>
              <button className="btn-primary !py-1.5 !px-3.5 text-xs shrink-0" onClick={() => onPick(d)}>Continue</button>
              <button className="text-[11px] text-slate-300 hover:text-red-500 underline shrink-0"
                onClick={() => { if (confirm(`Discard "${d.customer_name || "this inquiry"}"?`)) onDiscard(d); }}>Discard</button>
            </div>
          ))}
        </div>
        <button className="btn-ghost mt-4 text-sm" onClick={onNew}>＋ Start a new inquiry instead</button>
      </div>
    </div>
  );
}
