"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, logActivity } from "@/lib/supabase";
import { MenuTemplate, MenuSection, MenuOption, PriceModel } from "@/lib/menuEngine";

// ─── Plain-language vocabulary for non-technical building ───
const TYPE_CHOICES: { value: MenuSection["type"]; label: string; hint: string }[] = [
  { value: "choose", label: "Pick ONE option", hint: "Radio buttons — e.g. Choose Your Soup" },
  { value: "multi", label: "Pick SEVERAL options", hint: "Checkboxes — e.g. Choose 4 hot dishes" },
  { value: "toggle", label: "Yes / No add-on", hint: "One checkbox — e.g. Add Slider Platters" },
  { value: "qty", label: "Quantities", hint: "Number per item — e.g. 3 slider trays, 2 stations" },
  { value: "text", label: "Free text", hint: "Notes, special requests, names" },
  { value: "info", label: "Info only (no input)", hint: "Display package details, refill policy…" },
];

const PRICE_CHOICES: { value: string; label: string }[] = [
  { value: "", label: "Included (no charge)" },
  { value: "per_person", label: "Per person (whole party)" },
  { value: "per_adult", label: "Per adult" },
  { value: "per_side_person", label: "Per person (this side only)" },
  { value: "flat", label: "Flat price" },
  { value: "per_tray", label: "Per unit × quantity (tray, station, hour…)" },
  { value: "per_table", label: "Per table × number of tables" },
  { value: "per_person_qty", label: "Per person × a count the rep enters" },
];

// ─── Preset library: one click inserts ready-made sections ───
const PRESETS: { name: string; sections: MenuSection[] }[] = [
  {
    name: "Room Setup (mechitzah, centerpieces, head table)",
    sections: [
      { key: "mechitzah", title: "Do you need a Mechitzah (divider)?", type: "choose", required: true, options: [{ label: "Yes" }, { label: "No" }] },
      { key: "centerpieces", title: "Centerpieces", type: "choose", options: [{ label: "Yes", price: { model: "flat", amount: 150 } }, { label: "No" }] },
      { key: "head_table", title: "Head Table Setup (optional)", type: "text", help: "Number of people and event type." },
      { key: "setup_notes", title: "Special Room Setup Instructions", type: "text" },
    ],
  },
  {
    name: "Children's Menu questions",
    sections: [
      { key: "child_allergy", title: "Do any children have food allergies or dietary restrictions?", type: "choose", options: [{ label: "Yes" }, { label: "No" }] },
      { key: "child_allergy_details", title: "Children's allergies / dietary details", type: "text", visible_if: { key: "child_allergy", equals: "Yes" } },
      { key: "child_table", title: "Separate children's table?", type: "choose", options: [{ label: "Yes, separate children's table" }, { label: "No, children sit with adults" }] },
    ],
  },
  {
    name: "Dish picker (choose N from a list)",
    sections: [
      { key: "dishes", title: "Main Dishes — Choose 4", type: "multi", count: { fixed: { min: 4, max: 4 } },
        options: [{ label: "Option 1" }, { label: "Option 2" }, { label: "Option 3" }, { label: "Option 4" }, { label: "Option 5" }] },
    ],
  },
  {
    name: "Food Stations (per-station pricing)",
    sections: [
      { key: "stations", title: "Food Stations", type: "qty", optional_group: true, help: "Enter how many of each station.",
        options: [
          { label: "Carving Station", price: { model: "per_tray", amount: 450, unit: "station" } },
          { label: "Sushi Station", price: { model: "per_tray", amount: 600, unit: "station" } },
          { label: "Salad Station", price: { model: "per_tray", amount: 250, unit: "station" } },
        ] },
    ],
  },
  {
    name: "Passed Hors d'Oeuvres",
    sections: [
      { key: "passings", title: "Passed Hors d'Oeuvres", type: "toggle",
        options: [{ label: "Add passed hors d'oeuvres service", price: { model: "per_person", amount: 9 } }] },
    ],
  },
  {
    name: "AV, Lighting & Staging",
    sections: [
      { key: "av", title: "AV, Lighting & Staging", type: "qty", optional_group: true,
        options: [
          { label: "Pinspot", price: { model: "per_tray", amount: 35, unit: "fixture" } },
          { label: "Uplight", price: { model: "per_tray", amount: 25, unit: "fixture" } },
          { label: "Sound System", price: { model: "per_tray", amount: 250, unit: "system" } },
        ] },
    ],
  },
  {
    name: "Stationery & Signage",
    sections: [
      { key: "stationery", title: "Stationery & Signage", type: "multi", optional_group: true,
        options: [
          { label: "Printed Menu Cards", price: { model: "per_person", amount: 1.5 } },
          { label: "Table Numbers", price: { model: "flat", amount: 40 } },
          { label: "Seating Chart Board", price: { model: "flat", amount: 75 } },
        ] },
    ],
  },
  {
    name: "Final questions (dietary, vendors, notes)",
    sections: [
      { key: "dietary", title: "Dietary Restrictions & Allergies", type: "text" },
      { key: "vendors", title: "Outside Vendors", type: "multi", optional_group: true,
        options: [{ label: "Photographer/Videographer" }, { label: "DJ/Band/Live Music" }, { label: "Outside Decorations" }] },
      { key: "notes", title: "Additional Notes", type: "text" },
    ],
  },
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

export default function TemplateBuilder() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === "new";

  const [rowId, setRowId] = useState<string | null>(null);
  const [tpl, setTpl] = useState<MenuTemplate>({
    slug: "", name: "", base: { adult_pp: 0, child_pp: 0 }, sections: [],
  });
  const [category, setCategory] = useState("General");
  const [categories, setCategories] = useState<string[]>([]);
  const [phase, setPhase] = useState<"basics" | "sections">(isNew ? "basics" : "sections");
  const [selIdx, setSelIdx] = useState<number>(-1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: cats } = await supabase.from("menu_templates").select("category");
    setCategories(Array.from(new Set((cats ?? []).map((c) => c.category ?? "General"))));
    if (!isNew) {
      const { data } = await supabase.from("menu_templates").select("*").eq("id", id).single();
      if (data) {
        setRowId(data.id);
        setTpl(data.config as MenuTemplate);
        setCategory(data.category ?? "General");
      }
    }
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  // ─── Section helpers ───
  const sections = tpl.sections;
  const setSections = (s: MenuSection[]) => setTpl((p) => ({ ...p, sections: s }));
  const uniqueKey = useCallback((base: string) => {
    let k = base || "section", i = 2;
    const keys = new Set(sections.map((s) => s.key));
    while (keys.has(k)) k = `${base}_${i++}`;
    return k;
  }, [sections]);

  function addBlank() {
    const s: MenuSection = { key: uniqueKey("new_section"), title: "New Section", type: "choose", options: [{ label: "Option 1" }] };
    setSections([...sections, s]);
    setSelIdx(sections.length);
  }
  function addPreset(p: typeof PRESETS[number]) {
    const added = p.sections.map((s) => ({ ...JSON.parse(JSON.stringify(s)), key: uniqueKey(s.key) }));
    setSections([...sections, ...added]);
    setSelIdx(sections.length);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const copy = [...sections];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setSections(copy);
    setSelIdx(j);
  }
  function remove(i: number) {
    setSections(sections.filter((_, x) => x !== i));
    setSelIdx(-1);
  }
  function patchSel(patch: Partial<MenuSection>) {
    setSections(sections.map((s, i) => (i === selIdx ? { ...s, ...patch } : s)));
  }

  async function save() {
    setMsg(null);
    if (!tpl.name.trim()) { setMsg({ ok: false, text: "Give the template a name first." }); return; }
    const slug = tpl.slug || slugify(tpl.name);
    const dupes = sections.map((s) => s.key).filter((k, i, a) => a.indexOf(k) !== i);
    if (dupes.length) { setMsg({ ok: false, text: `Duplicate section keys: ${Array.from(new Set(dupes)).join(", ")}` }); return; }
    setBusy(true);
    const config = { ...tpl, slug };

    if (rowId) {
      const { error } = await supabase.from("menu_templates")
        .update({ name: tpl.name, category, config, updated_at: new Date().toISOString() })
        .eq("id", rowId);
      setBusy(false);
      if (error) { setMsg({ ok: false, text: error.message }); return; }
      await logActivity(null, "—", "Menu Template Updated", `${slug} via builder — ${sections.length} sections`);
      setMsg({ ok: true, text: "Saved ✓" });
    } else {
      const { data: maxRow } = await supabase.from("menu_templates")
        .select("sort_order").eq("category", category).order("sort_order", { ascending: false }).limit(1);
      const sort_order = ((maxRow?.[0]?.sort_order as number) ?? 0) + 10 || 100;
      const { data, error } = await supabase.from("menu_templates")
        .insert({ slug, name: tpl.name, category, sort_order, config })
        .select().single();
      setBusy(false);
      if (error) { setMsg({ ok: false, text: error.message.includes("duplicate") ? `A template with slug "${slug}" already exists — change the name or slug.` : error.message }); return; }
      setRowId(data.id);
      await logActivity(null, "—", "Menu Template Created", `${slug} via builder`);
      setMsg({ ok: true, text: "Created ✓ — keep building, changes save to this template now." });
    }
  }

  const sel = selIdx >= 0 ? sections[selIdx] : null;

  // ═══════════ PHASE 1: BASICS (guided questions) ═══════════
  if (phase === "basics") {
    return (
      <div className="max-w-xl">
        <button className="text-xs text-slate-400 hover:text-navy" onClick={() => router.push("/templates")}>← Templates</button>
        <h1 className="page-title mt-2">New Menu Template</h1>
        <p className="text-sm text-slate-500 mt-1">A few questions, then we build sections.</p>
        <div className="gold-rule mt-3 mb-6" />

        <div className="card p-6 space-y-5">
          <div>
            <label className="label">1. What is this menu called?</label>
            <input className="field" placeholder="e.g. Cocktail Reception, Shabbos Sheva Brochos, BBQ Package"
              value={tpl.name} onChange={(e) => setTpl((p) => ({ ...p, name: e.target.value, slug: slugify(e.target.value) }))} />
            {tpl.slug && <p className="text-[11px] text-slate-400 mt-1">System id: {tpl.slug}</p>}
          </div>

          <div>
            <label className="label">2. What category does it belong to?</label>
            <div className="flex gap-2">
              <select className="field" value={categories.includes(category) ? category : "__new"}
                onChange={(e) => { if (e.target.value !== "__new") setCategory(e.target.value); else setCategory(""); }}>
                {categories.map((c) => <option key={c}>{c}</option>)}
                <option value="__new">+ New category…</option>
              </select>
              {!categories.includes(category) && (
                <input className="field" placeholder="New category name" value={category} onChange={(e) => setCategory(e.target.value)} />
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Categories group templates in the list (e.g. Buffet Service, Plated Dinner Service).</p>
          </div>

          <div>
            <label className="label">3. Is there a base per-person price?</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input className="field" type="number" step="0.01" placeholder="Adults $/pp (0 = none)"
                  value={tpl.base.adult_pp || ""} onChange={(e) => setTpl((p) => ({ ...p, base: { ...p.base, adult_pp: parseFloat(e.target.value) || 0 } }))} />
                <p className="text-[11px] text-slate-400 mt-1">Adults, per person</p>
              </div>
              <div>
                <input className="field" type="number" step="0.01" placeholder="Children $/pp"
                  value={tpl.base.child_pp || ""} onChange={(e) => setTpl((p) => ({ ...p, base: { ...p.base, child_pp: parseFloat(e.target.value) || 0 } }))} />
                <p className="text-[11px] text-slate-400 mt-1">Children, per person</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Leave at 0 for an add-on sheet with no base price (like the Production sheet).</p>
          </div>

          <div>
            <label className="label">4. Is there a guest minimum?</label>
            <input className="field" type="number" placeholder="Minimum guests (blank = none)"
              value={tpl.base.min_guests ?? ""} onChange={(e) => setTpl((p) => ({ ...p, base: { ...p.base, min_guests: parseInt(e.target.value) || undefined } }))} />
            <p className="text-[11px] text-slate-400 mt-1">Below this, the menu form requires a logged override to complete.</p>
          </div>

          <div>
            <label className="label">5. Anything customers should know up front? (optional)</label>
            <textarea className="field" rows={2} placeholder="Service hours included, overtime rate, what the package includes…"
              value={tpl.base.notes ?? ""} onChange={(e) => setTpl((p) => ({ ...p, base: { ...p.base, notes: e.target.value || undefined } }))} />
          </div>

          <button className="btn-primary w-full" disabled={!tpl.name.trim() || !category.trim()}
            onClick={() => setPhase("sections")}>
            Continue → Build Sections
          </button>
        </div>
      </div>
    );
  }

  // ═══════════ PHASE 2: SECTIONS ═══════════
  return (
    <div className="pb-24">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <button className="text-xs text-slate-400 hover:text-navy" onClick={() => router.push("/templates")}>← Templates</button>
          <h1 className="font-display text-2xl font-bold tracking-tight mt-1">{tpl.name || "Untitled Template"}</h1>
          <p className="text-xs text-slate-500">{category} · {sections.length} sections {tpl.base.adult_pp ? `· $${tpl.base.adult_pp}/pp` : ""}{tpl.base.min_guests ? ` · ${tpl.base.min_guests} min` : ""}
            <button className="text-navy underline ml-2" onClick={() => setPhase("basics")}>edit basics</button>
          </p>
        </div>
        <div className="flex gap-2">
          {msg && <span className={`text-sm font-semibold self-center ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</span>}
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "💾 Save Template"}</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-5 items-start">
        {/* ── Section list + add controls ── */}
        <div className="space-y-2">
          {sections.map((s, i) => (
            <div key={s.key} className={`card px-3 py-2.5 flex items-center gap-2 cursor-pointer ${i === selIdx ? "ring-2 ring-navy" : ""}`}
              onClick={() => setSelIdx(i)}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.title}</div>
                <div className="text-[11px] text-slate-400">{TYPE_CHOICES.find((t) => t.value === s.type)?.label}</div>
              </div>
              <div className="flex flex-col">
                <button className="text-slate-300 hover:text-navy text-xs leading-none" onClick={(e) => { e.stopPropagation(); move(i, -1); }}>▲</button>
                <button className="text-slate-300 hover:text-navy text-xs leading-none" onClick={(e) => { e.stopPropagation(); move(i, 1); }}>▼</button>
              </div>
              <button className="text-red-300 hover:text-red-600 text-sm" onClick={(e) => { e.stopPropagation(); remove(i); }}>✕</button>
            </div>
          ))}

          <button className="btn-ghost w-full" onClick={addBlank}>＋ Blank section</button>
          <div className="card p-3">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Start from a preset</div>
            <div className="space-y-1">
              {PRESETS.map((p) => (
                <button key={p.name} className="w-full text-left text-xs text-navy hover:underline py-0.5" onClick={() => addPreset(p)}>
                  ＋ {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Section editor + preview ── */}
        {sel ? (
          <div className="space-y-4">
            <div className="card p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Section title</label>
                  <input className="field" value={sel.title} onChange={(e) => patchSel({ title: e.target.value })} />
                </div>
                <div>
                  <label className="label">What kind of question?</label>
                  <select className="field" value={sel.type} onChange={(e) => patchSel({ type: e.target.value as MenuSection["type"] })}>
                    {TYPE_CHOICES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">{TYPE_CHOICES.find((t) => t.value === sel.type)?.hint}</p>
                </div>
              </div>
              <div>
                <label className="label">Help text (optional — shown under the title)</label>
                <input className="field" value={sel.help ?? ""} onChange={(e) => patchSel({ help: e.target.value || undefined })} />
              </div>

              {/* Count rule for multi */}
              {sel.type === "multi" && <CountEditor sel={sel} patch={patchSel} />}
              {sel.type === "choose" && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!sel.required} onChange={(e) => patchSel({ required: e.target.checked || undefined })} />
                  Selection is required
                </label>
              )}

              {/* Options */}
              {sel.type !== "text" && sel.type !== "info" && (
                <OptionsEditor sel={sel} patch={patchSel} />
              )}

              {/* Section price */}
              {(sel.type === "multi" || sel.type === "text") && (
                <SectionPriceEditor sel={sel} patch={patchSel} />
              )}

              {/* Conditional display */}
              <VisibleIfEditor sel={sel} sections={sections} patch={patchSel} />
            </div>

            {/* Live preview */}
            <div className="card p-5 border-2 border-dashed border-gold/40">
              <div className="text-[11px] font-bold text-gold uppercase tracking-wider mb-2">Preview — how the rep sees it</div>
              <Preview s={sel} />
            </div>
          </div>
        ) : (
          <div className="card p-12 text-center text-slate-400">
            Select a section to edit, add a blank one, or start from a preset. ◀
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Count rule editor (multi) ───
function CountEditor({ sel, patch }: { sel: MenuSection; patch: (p: Partial<MenuSection>) => void }) {
  const c = sel.count;
  const mode = !c ? "any" : "fixed" in c ? "fixed" : "by_tier" in c ? "tier" : "advanced";
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <label className="label">How many can they pick?</label>
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "any"} onChange={() => patch({ count: undefined, optional_group: true })} /> Any number</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "fixed"} onChange={() => patch({ count: { fixed: { min: 1, max: 1 } }, optional_group: undefined })} /> Exactly N</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "tier"} onChange={() => patch({ count: { by_tier: { source: "total", tiers: [{ min: 0, choose: 2 }, { min: 40, choose: 4 }] } } })} /> Depends on guest count</label>
      </div>
      {mode === "fixed" && c && "fixed" in c && (
        <div className="flex items-center gap-2 mt-2 text-sm">
          Exactly <input className="field !w-20" type="number" min="1" value={c.fixed.min}
            onChange={(e) => { const n = parseInt(e.target.value) || 1; patch({ count: { fixed: { min: n, max: n } } }); }} /> selections
          <label className="flex items-center gap-1.5 ml-3">
            <input type="checkbox" checked={!!sel.optional_group} onChange={(e) => patch({ optional_group: e.target.checked || undefined })} />
            …or skip entirely (optional add-on)
          </label>
        </div>
      )}
      {mode === "tier" && c && "by_tier" in c && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            Count from:
            <select className="field !w-auto" value={c.by_tier.source}
              onChange={(e) => patch({ count: { by_tier: { ...c.by_tier, source: e.target.value as "men" | "women" | "total" } } })}>
              <option value="total">total guests</option><option value="men">men&apos;s side</option><option value="women">women&apos;s side</option>
            </select>
          </div>
          {c.by_tier.tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              From <input className="field !w-20" type="number" value={t.min}
                onChange={(e) => { const tiers = [...c.by_tier.tiers]; tiers[i] = { ...t, min: parseInt(e.target.value) || 0 }; patch({ count: { by_tier: { ...c.by_tier, tiers } } }); }} />
              guests → pick <input className="field !w-20" type="number" value={t.choose}
                onChange={(e) => { const tiers = [...c.by_tier.tiers]; tiers[i] = { ...t, choose: parseInt(e.target.value) || 0 }; patch({ count: { by_tier: { ...c.by_tier, tiers } } }); }} />
              <button className="text-red-400 text-xs" onClick={() => patch({ count: { by_tier: { ...c.by_tier, tiers: c.by_tier.tiers.filter((_, x) => x !== i) } } })}>✕</button>
            </div>
          ))}
          <button className="text-xs text-navy underline"
            onClick={() => patch({ count: { by_tier: { ...c.by_tier, tiers: [...c.by_tier.tiers, { min: 0, choose: 1 }] } } })}>
            + tier row
          </button>
        </div>
      )}
      {mode === "advanced" && (
        <p className="text-xs text-amber-700 mt-2">This section uses an advanced rule (count follows another answer) — edit it in the JSON editor; the builder preserves it untouched.</p>
      )}
    </div>
  );
}

// ─── Options editor with per-option pricing ───
function OptionsEditor({ sel, patch }: { sel: MenuSection; patch: (p: Partial<MenuSection>) => void }) {
  const opts = sel.options ?? [];
  const setOpt = (i: number, o: MenuOption) => patch({ options: opts.map((x, j) => (j === i ? o : x)) });
  return (
    <div>
      <label className="label">Options</label>
      <div className="space-y-2">
        {opts.map((o, i) => {
          const pm = o.price?.model ?? "";
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input className="field !w-56 flex-1" value={o.label} placeholder="Option name"
                onChange={(e) => setOpt(i, { ...o, label: e.target.value })} />
              <select className="field !w-64" value={pm}
                onChange={(e) => {
                  const v = e.target.value;
                  setOpt(i, { ...o, price: v ? ({ model: v, amount: o.price?.amount ?? 0, unit: o.price?.unit } as PriceModel) : undefined });
                }}>
                {PRICE_CHOICES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {pm && (
                <input className="field !w-24" type="number" step="0.01" placeholder="$"
                  value={o.price?.amount ?? ""} onChange={(e) => setOpt(i, { ...o, price: { ...(o.price as PriceModel), amount: parseFloat(e.target.value) || 0 } })} />
              )}
              {pm === "per_tray" && (
                <input className="field !w-28" placeholder="unit (tray…)" value={o.price?.unit ?? ""}
                  onChange={(e) => setOpt(i, { ...o, price: { ...(o.price as PriceModel), unit: e.target.value || undefined } })} />
              )}
              <button className="text-red-400 hover:text-red-600" onClick={() => patch({ options: opts.filter((_, j) => j !== i) })}>✕</button>
            </div>
          );
        })}
      </div>
      <button className="text-xs text-navy underline mt-2" onClick={() => patch({ options: [...opts, { label: "" }] })}>+ option</button>
    </div>
  );
}

// ─── Section-level price ───
function SectionPriceEditor({ sel, patch }: { sel: MenuSection; patch: (p: Partial<MenuSection>) => void }) {
  const sp = sel.section_price;
  const mode = !sp ? "" : sp.model;
  if (mode === "per_person_by_count") {
    return <p className="text-xs text-amber-700">This section uses count-based pricing (e.g. 1 soup $4 / 2 soups $6) — edit in the JSON editor; preserved untouched.</p>;
  }
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <label className="label">{sel.type === "text" ? "Charge when filled in?" : "Charge when anything is selected? (on top of option prices)"}</label>
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <select className="field !w-56" value={mode}
          onChange={(e) => {
            const v = e.target.value;
            patch({ section_price: v ? ({ model: v as "per_person" | "flat", amount: (sp && "amount" in sp ? sp.amount : 0) || 0 }) : undefined });
          }}>
          <option value="">No section charge</option>
          <option value="per_person">Per person (whole party)</option>
          <option value="flat">Flat price</option>
        </select>
        {mode && sp && "amount" in sp && (
          <input className="field !w-24" type="number" step="0.01" value={sp.amount}
            onChange={(e) => patch({ section_price: { model: sp.model as "per_person" | "flat", amount: parseFloat(e.target.value) || 0 } })} />
        )}
      </div>
    </div>
  );
}

// ─── Conditional display ───
function VisibleIfEditor({ sel, sections, patch }: { sel: MenuSection; sections: MenuSection[]; patch: (p: Partial<MenuSection>) => void }) {
  const candidates = sections.filter((s) => s.key !== sel.key && (s.type === "choose" || s.type === "toggle") && (s.options?.length ?? 0) > 0);
  const v = sel.visible_if;
  const src = candidates.find((c) => c.key === v?.key);
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <label className="label">Only show this section when…</label>
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <select className="field !w-64" value={v?.key ?? ""}
          onChange={(e) => {
            const key = e.target.value;
            if (!key) { patch({ visible_if: undefined }); return; }
            const c = candidates.find((x) => x.key === key);
            patch({ visible_if: { key, equals: c?.options?.[0]?.label ?? "" } });
          }}>
          <option value="">Always shown</option>
          {candidates.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
        </select>
        {v && src && (
          <>
            equals
            <select className="field !w-56" value={v.equals ?? ""}
              onChange={(e) => patch({ visible_if: { key: v.key, equals: e.target.value } })}>
              {(src.options ?? []).map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
          </>
        )}
        {v && !src && <span className="text-xs text-amber-700">Advanced condition — preserved; edit in JSON.</span>}
      </div>
    </div>
  );
}

// ─── Live preview of one section ───
function Preview({ s }: { s: MenuSection }) {
  const tag = (p?: PriceModel) => {
    if (!p) return null;
    const suffix = p.unit ? `/${p.unit}` :
      p.model === "per_person" ? "/pp" : p.model === "per_adult" ? "/adult" :
      p.model === "per_side_person" ? "/pp (side)" : p.model === "per_tray" ? "/tray" :
      p.model === "per_table" ? "/table" :
      p.model === "per_person_qty" ? "/person" : "";
    return <span className="text-navy font-semibold"> (+${p.amount}{suffix})</span>;
  };
  if (s.type === "info") {
    return (
      <div className="rounded-xl bg-goldsoft border border-gold/30 px-4 py-3">
        <div className="font-display font-bold text-sm">{s.title}</div>
        {s.help && <p className="text-xs text-slate-600 mt-1">{s.help}</p>}
      </div>
    );
  }
  return (
    <div>
      <h3 className="font-display font-bold text-sm">{s.title} {s.required && <span className="text-red-500">*</span>}</h3>
      {s.help && <p className="text-xs text-slate-500 mt-0.5">{s.help}</p>}
      <div className="mt-2 space-y-1.5">
        {s.type === "text" && <textarea className="field" rows={2} disabled placeholder="…" />}
        {(s.options ?? []).map((o) => (
          <div key={o.label || Math.random()} className="flex items-center gap-2.5 text-sm">
            {s.type === "qty"
              ? <input className="field !w-16" type="number" disabled placeholder="0" />
              : <input type={s.type === "choose" ? "radio" : "checkbox"} disabled />}
            <span>{o.label || <em className="text-slate-300">unnamed option</em>}{tag(o.price)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
