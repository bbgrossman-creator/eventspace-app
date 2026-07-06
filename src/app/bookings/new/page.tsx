"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
    if (useRefusal && holder) { router.push(`/bookings/${holder.id}`); return; }
    router.push(`/bookings/${data.id}`);
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">New Inquiry</h1>
        <p className="text-sm text-slate-500 mt-1">Creates a 24-hour hold and assigns the next invoice number.</p>
        <div className="gold-rule mt-3" />
      </header>

      <div className="card p-6 space-y-6">
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
        <div>
        <SectionHead>Customer Information</SectionHead>
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
        </div>

        {/* 2 — Event (type + date lead: the two facts that matter most after the name) */}
        <div>
        <SectionHead>Event Details</SectionHead>
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
        </div>

        {/* 3 — Notes */}
        <div>
        <SectionHead>Additional Notes</SectionHead>
          <textarea className="field" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering from the call…" />
        </div>

        {dupes.length > 0 && (
          <div id="dupes-panel" className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 text-sm text-amber-900">
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

      <div className="card p-6 mt-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-display font-bold text-sm">Quick pricing reference</h2>
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