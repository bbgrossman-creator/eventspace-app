// Generates supabase/menu_templates.sql — Burger Bar's menus encoded as templates.
// Run: node scripts/generate-menu-seed.js
const fs = require("fs");

// ── Shared option lists (from the Google Forms) ──
const SMORG_MAINS = [
  { label: "Buffalo Poppers" }, { label: "Crispy Chicken" }, { label: "Cornflake Chicken" },
  { label: "Popcorn Chicken" }, { label: "Jack Daniels Poppers" },
  { label: "Crispy Beef", price: { model: "flat", amount: 25 } },
];
const SMORG_APPS = [
  { label: "Crispy Cauliflower" }, { label: "Burger Bites" }, { label: "Pastrami Fritos" },
  { label: "Franks N Blanks" }, { label: "Mini Potato Knishes" }, { label: "Beef Cigars" },
  { label: "Potato Kugel" }, { label: "Kishka & Gravy" }, { label: "Mini Egg Rolls" },
];
const BUFFET_MAINS = [
  { label: "Buffalo Poppers" }, { label: "Crispy Chicken" }, { label: "Cornflake Chicken" },
  { label: "Popcorn Chicken" }, { label: "Jack Daniels Poppers" },
  { label: "Crispy Beef", price: { model: "per_side_person", amount: 2.5 } },
  { label: "Pepper Steak", price: { model: "per_side_person", amount: 2.5 } },
  { label: "Cholent (Thursday only)" },
];
const BUFFET_APPS = [
  { label: "Crispy Cauliflower" }, { label: "Burger Bites" }, { label: "Pastrami Fritos" },
  { label: "Franks N Blanks" }, { label: "Mini Potato Knishes" }, { label: "Beef Cigars" },
  { label: "Potato Kugel" }, { label: "Kishka & Gravy" }, { label: "Egg Rolls" },
];
const BUFFET_SIDES = [
  { label: "Fries" }, { label: "Spicy Fries" }, { label: "Onion Rings" },
  { label: "Grilled Vegetables" }, { label: "Yellow Rice" }, { label: "White Rice" },
];
const BUFFET_SALADS = [
  { label: "Caesar Salad" }, { label: "Deli Salad" },
  { label: "Mexican Chop Salad" }, { label: "Caesar Steak Salad" },
];
const FLAT_SALADS = [
  { label: "Caesar Salad", price: { model: "flat", amount: 65 } },
  { label: "Chicken Caesar", price: { model: "flat", amount: 110 } },
  { label: "Mexican Chop Salad", price: { model: "flat", amount: 140 } },
  { label: "Caesar Steak Salad", price: { model: "flat", amount: 150 } },
];
const SOUPS = [
  { label: "Homestyle Chicken Matzah Ball Soup" }, { label: "Cream of Chicken Soup" },
  { label: "Cream of Zucchini Soup" }, { label: "Butternut Squash Soup" },
  { label: "Barley Beef Soup", price: { model: "per_person", amount: 5 } },
];
const DESSERT_STATION = [
  { label: "Churros with Vanilla Ice Cream" },
  { label: "Chocolate Soufflé with Vanilla Ice Cream" },
  { label: "Apple Cobbler with Vanilla Ice Cream" },
];
const PLATED_DESSERTS = [
  { label: "Chocolate Soufflé & Vanilla Ice Cream" }, { label: "Apple Cobbler & Vanilla Ice Cream" },
  { label: "Cinnamon Churros & Vanilla Ice Cream" },
];
const STARTERS = [
  { label: "Chicken Caesar Salad with BBQ Grilled Chicken" },
  { label: "Chicken Caesar Salad with Baby Chicken" },
  { label: "Chicken Caesar Salad with Schnitzel" },
  { label: "Deli Salad" },
  { label: "Caesar Steak Salad" },
];
const PKG_MAP_SMORG = { "2 Hot Dishes ($400)": 1, "4 Hot Dishes ($600)": 2, "6 Hot Dishes ($800)": 3, "8 Hot Dishes ($1000)": 4, "10 Hot Dishes ($1200)": 5 };
const SMORG_PKGS = Object.keys(PKG_MAP_SMORG).map((label) => ({
  label, price: { model: "flat", amount: Number(label.match(/\$(\d+)/)[1]) },
}));

// ── Smorg block builder (shared / men / women) ──
function smorgBlock(prefix, title, visible) {
  return [
    { key: `${prefix}_pkg`, title: `${title} — Package`, type: "choose", required: true,
      help: "Each hot dish set includes a Main Dish + Appetizer tray.", options: SMORG_PKGS, visible_if: visible },
    { key: `${prefix}_main`, title: `${title} — Main Dish Trays`, type: "multi",
      count: { by_answer: { key: `${prefix}_pkg`, map: PKG_MAP_SMORG } }, options: SMORG_MAINS, visible_if: visible },
    { key: `${prefix}_app`, title: `${title} — Appetizer Trays`, type: "multi",
      count: { by_answer: { key: `${prefix}_pkg`, map: PKG_MAP_SMORG } }, options: SMORG_APPS, visible_if: visible },
    { key: `${prefix}_platters`, title: `${title} — Extra Platters`, type: "multi", optional_group: true,
      options: [
        { label: "Large Fruit Platter", price: { model: "flat", amount: 125 } },
        { label: "Assorted Petite Four Platter", price: { model: "flat", amount: 125 } },
      ], visible_if: visible },
    { key: `${prefix}_salads`, title: `${title} — Salads`, type: "multi", optional_group: true,
      help: "Minimum 2 for display. Served in bowls.", options: FLAT_SALADS, visible_if: visible },
  ];
}

// ── Per-side buffet block builder (used by Double Buffet) ──
function sideBuffetBlock(sideKey, sideName) {
  const tiers = { main: [{min:0,choose:2},{min:20,choose:3},{min:30,choose:4},{min:40,choose:4}],
                  app:  [{min:0,choose:1},{min:20,choose:2},{min:30,choose:2},{min:40,choose:4}],
                  side: [{min:0,choose:1},{min:20,choose:1},{min:30,choose:2},{min:40,choose:2}],
                  salad:[{min:0,choose:1},{min:20,choose:2}] };
  return [
    { key: `${sideKey}_info`, title: `${sideName} Buffet`, type: "info",
      help: "10 guests: 4 hot dishes · 20: 6 · 30: 8 · 40+: 10. Refills (40+): 50→2, 60→4, 70→6, 80→8, 90→10, 100→12. Refills are discretionary; extra refills billed per tray after the event." },
    { key: `${sideKey}_main`, title: `${sideName} — Main Dishes`, type: "multi", side: sideKey,
      count: { by_tier: { source: sideKey, tiers: tiers.main } }, options: BUFFET_MAINS },
    { key: `${sideKey}_app`, title: `${sideName} — Appetizers`, type: "multi", side: sideKey,
      count: { by_tier: { source: sideKey, tiers: tiers.app } }, options: BUFFET_APPS },
    { key: `${sideKey}_side`, title: `${sideName} — Side Dishes`, type: "multi", side: sideKey,
      count: { by_tier: { source: sideKey, tiers: tiers.side } }, options: BUFFET_SIDES },
    { key: `${sideKey}_salads`, title: `${sideName} — Salads`, type: "multi", side: sideKey,
      count: { by_tier: { source: sideKey, tiers: tiers.salad } }, options: BUFFET_SALADS },
    { key: `${sideKey}_bread`, title: `${sideName} — Bread Station`, type: "choose", required: true,
      options: [{ label: "Standard bread station — assorted dinner rolls" },
                { label: "Individual upgrade — select Bread & Chummus or Starter in Add-Ons" }] },
    { key: `${sideKey}_dessert`, title: `${sideName} — Plated Dessert`, type: "choose", required: true,
      options: [...PLATED_DESSERTS, { label: "Dessert Station Upgrade (replaces plated dessert)" }] },
  ];
}

// ── Buffet add-ons block (single = whole party; sides reuse with side pricing) ──
function buffetAddons(prefix, sideKey) {
  const side = sideKey ? { side: sideKey } : {};
  return [
    { key: `${prefix}_charger`, title: "Charger & Dinner Plate Upgrade", type: "toggle", ...side,
      options: [{ label: "Add charger & dinner plate", price: { model: sideKey ? "per_side_person" : "per_person", amount: 4 } }] },
    { key: `${prefix}_starter`, title: "Individual Starter (+$16/pp)", type: "choose", ...side,
      help: "Includes 2 mini baguettes, individual chummus, and your selected starter. Replaces the standard bread station.",
      options: STARTERS.map((s) => ({ ...s, price: { model: sideKey ? "per_side_person" : "per_person", amount: 16 } })) },
    { key: `${prefix}_wrap`, title: "Wrap Platter Add-On", type: "toggle", ...side,
      help: "Mini wraps, displayed and refilled: Pulled Brisket · Pastrami · Schnitzel · Grilled Chicken",
      options: [{ label: "Add wrap platter", price: { model: sideKey ? "per_side_person" : "per_person", amount: 7 } }] },
    { key: `${prefix}_sandwich`, title: "Sandwich Platter Add-On", type: "toggle", ...side,
      options: [{ label: "Add sandwich platter", price: { model: sideKey ? "per_side_person" : "per_person", amount: 7 } }] },
    { key: `${prefix}_soup`, title: "Soup", type: "multi", optional_group: true, ...side,
      count: { fixed: { min: 0, max: 2 } },
      help: "+$4/pp for one soup, +$6/pp for two. Barley Beef adds $5/pp.",
      section_price: { model: "per_person_by_count", by_count: { "1": 4, "2": 6 } },
      options: SOUPS.map((s) => s.label === "Barley Beef Soup"
        ? { label: s.label, price: { model: sideKey ? "per_side_person" : "per_person", amount: 5 } } : { label: s.label }) },
    { key: `${prefix}_platters`, title: "Dessert Platters", type: "multi", optional_group: true, ...side,
      options: [
        { label: "Large Fruit Platter", price: { model: "flat", amount: 125 } },
        { label: "Assorted Petite Four Platter", price: { model: "flat", amount: 125 } },
      ] },
    { key: `${prefix}_station`, title: "Dessert Station Upgrade (+$6/pp — replaces plated dessert)", type: "multi",
      optional_group: true, ...side,
      section_price: { model: sideKey ? "per_person" : "per_person", amount: 6 },
      options: DESSERT_STATION },
    { key: `${prefix}_passing`, title: "Dessert Passing (+$5/pp)", type: "toggle", ...side,
      help: "Mini pops passed tableside, in addition to plated dessert: Orange Creamsicle · Green Apple · Raspberry Lemon",
      options: [{ label: "Add Dessert Passing", price: { model: sideKey ? "per_side_person" : "per_person", amount: 5 } }] },
    { key: `${prefix}_thursday`, title: "Thursday Add-On (Thursdays only)", type: "toggle", ...side,
      help: "Cholent, Kugel, and Kishka with Gravy. Tray quantities scale with guest count.",
      options: [{ label: "Add Thursday package", price: { model: sideKey ? "per_side_person" : "per_person", amount: 7.5 } }] },
    { key: `${prefix}_bread_chummus`, title: "Individual Bread & Chummus (+$6/pp)", type: "toggle", ...side,
      help: "2 mini baguettes + individual chummus per guest. Replaces standard bread station. Not needed with Individual Starter.",
      options: [{ label: "Add bread & chummus", price: { model: sideKey ? "per_side_person" : "per_person", amount: 6 } }] },
  ];
}

const finalQuestions = [
  { key: "dietary", title: "Dietary Restrictions & Allergies", type: "text",
    help: "Any restrictions, allergies, or special dietary needs (all guests)." },
  { key: "vendors", title: "Outside Vendors", type: "multi", optional_group: true,
    options: [{ label: "Photographer/Videographer" }, { label: "DJ/Band/Live Music" },
              { label: "Outside Decorations (requires prior permission)" }] },
  { key: "vendor_details", title: "Vendor Details", type: "text" },
  { key: "notes", title: "Additional Notes", type: "text" },
];

const childrenQuestions = [
  { key: "child_allergy", title: "Do any children have food allergies or dietary restrictions?", type: "choose",
    options: [{ label: "Yes" }, { label: "No" }] },
  { key: "child_allergy_details", title: "Children's allergies / dietary details", type: "text",
    visible_if: { key: "child_allergy", equals: "Yes" } },
  { key: "child_requests", title: "Special requests for children's meals", type: "text" },
  { key: "child_table", title: "Separate children's table?", type: "choose",
    options: [{ label: "Yes, separate children's table" }, { label: "No, children sit with adults" }] },
];

const roomSetup = [
  { key: "mechitzah", title: "Do you need a Mechitzah (divider)?", type: "choose", required: true,
    options: [{ label: "Yes" }, { label: "No" }] },
  { key: "centerpieces", title: "Centerpieces (+$150)", type: "choose",
    help: "Elegant centerpieces on every table.",
    options: [{ label: "Yes", price: { model: "flat", amount: 150 } }, { label: "No" }] },
  { key: "head_table", title: "Head Table Setup (optional)", type: "text",
    help: "Number of people and event type, e.g. 'Chosson and Kallah table – 2 people'." },
  { key: "setup_notes", title: "Special Room Setup Instructions", type: "text" },
];

// ═══════════ TEMPLATE 1: FULL SERVICE ═══════════
const fullService = {
  slug: "full_service",
  name: "Full Service Plated Dinner",
  category: "Plated Dinner Service",
  sort_order: 10,
  base: { adult_pp: 60, child_pp: 50, min_guests: 40,
    notes: "Includes place settings, beverages, 2.5 hrs professional service, soup, mains, sides, dessert. Tables include coleslaw & pickles; each setting includes 2 mini baguettes & hummus. Children $50 up to age 8; 9+ are adults." },
  sections: [
    ...roomSetup,
    { key: "starter", title: "Choose Your Starter", type: "choose", required: true,
      options: [
        { label: "Chicken Caesar Salad with BBQ Grilled Chicken" },
        { label: "Chicken Caesar Salad with Baby Chicken" },
        { label: "Chicken Caesar Salad with Schnitzel" },
        { label: "Caesar Steak Salad" },
      ] },
    { key: "soup", title: "Choose Your Soup", type: "choose", required: true, options: SOUPS },
    { key: "beef_main", title: "Choose Your Beef Main Course", type: "choose", required: true,
      options: [
        { label: "Brisket" }, { label: "Crispy Beef" }, { label: "Pepper Steak" },
        { label: "Rib Steak", price: { model: "per_person", amount: 30 } },
      ] },
    { key: "chicken_main", title: "Choose Your Chicken Main Course", type: "choose", required: true,
      options: [
        { label: "Grilled BBQ Chicken" }, { label: "Baby Chicken" }, { label: "Schnitzel" },
        { label: "Beer Batter Chicken" }, { label: "Chicken Marsala" },
      ] },
    { key: "second_chicken", title: "Guest Choice of Two Chicken Options (+$5/pp, whole party)", type: "text",
      help: "Enter the second chicken option and estimated guest count, e.g. 'Baby Chicken – approx 25 guests'. Leave blank if not applicable.",
      section_price: { model: "per_person", amount: 5 } },
    { key: "womens_chicken", title: "Women's Alternate Chicken Entrée (optional)", type: "text",
      help: "Only if women should receive a different chicken entrée than the main selection." },
    { key: "veg_side", title: "Choose Your Vegetable Side", type: "choose", required: true,
      options: [
        { label: "Sauteed Vegetable" }, { label: "Sauteed Green Beans with Garlic" },
        { label: "Julienne Vegetables" }, { label: "Sauteed Green Beans wrapped in Pastrami Bundle" },
      ] },
    { key: "starch_side", title: "Choose Your Starch Side", type: "choose", required: true,
      options: [
        { label: "White Rice" }, { label: "Yellow Rice" }, { label: "Mash Potato with Onion Ring Halo" },
        { label: "Fingerling Potato" }, { label: "Sweet Chili Glazed Fingerling Potato" },
        { label: "Homemade Fries" }, { label: "Onion Rings" },
      ] },
    { key: "dessert", title: "Choose Your Dessert", type: "choose", required: true,
      options: [...PLATED_DESSERTS, { label: "Sorbet Ice Pops" }] },

    // ── Optional add-ons ──
    { key: "fam_app_platter", title: "Family Style Appetizer Platter (+$7/pp)", type: "multi", optional_group: true,
      count: { fixed: { min: 3, max: 3 } },
      help: "Served in the center of each table; select exactly 3. Each platter serves 10. Extra platters after initial service: $70 ($35 head table).",
      section_price: { model: "per_person", amount: 7 },
      options: [{ label: "Onion Rings" }, { label: "Fries" }, { label: "Crispy Burger Bites" },
                { label: "Crispy Pastrami Fritos" }, { label: "Breaded Cauliflower" }] },
    { key: "palate", title: "Palate Cleanser — Sorbet Ice Pops", type: "toggle",
      options: [{ label: "Add Sorbet Ice Pops", price: { model: "per_person", amount: 2.5 } }] },
    { key: "sliders", title: "Slider Platters (+$6.50/pp)", type: "toggle",
      help: "Beef Burger, Pulled Brisket & Schnitzel sliders at the center of each table. Extra platters: $65 ($30 head table).",
      options: [{ label: "Add Slider Platters", price: { model: "per_person", amount: 6.5 } }] },
    { key: "fries_platters", title: "French Fries Platters (+$4.50/pp)", type: "toggle",
      help: "Extra platters after initial service: $45 ($25 head table).",
      options: [{ label: "Add Fries Platters", price: { model: "per_person", amount: 4.5 } }] },
    { key: "dessert_station", title: "Dessert Station Upgrade (+$6/pp)", type: "multi", optional_group: true,
      help: "Standard dessert is still served to all guests.",
      section_price: { model: "per_person", amount: 6 },
      options: DESSERT_STATION },

    ...childrenQuestions,

    // ── Reception smorgasbord ──
    { key: "smorg", title: "Reception Smorgasbord Buffet (standing/walkaround)", type: "choose", required: true,
      help: "Pre-event reception, starting at $400. Includes buffet setup, linen, plasticware, napkins, beverages.",
      options: [{ label: "Yes" }, { label: "No" }] },
    { key: "smorg_split", title: "Shared or separate smorgasbord?", type: "choose",
      help: "Most events use one shared buffet even with a mechitzah.",
      options: [{ label: "One buffet - shared" }, { label: "Separate buffets for men and women" }],
      visible_if: { key: "smorg", equals: "Yes" } },
    ...smorgBlock("smorg_shared", "Shared Smorg", { key: "smorg_split", equals: "One buffet - shared" }),
    ...smorgBlock("smorg_men", "Men's Smorg", { key: "smorg_split", equals: "Separate buffets for men and women" }),
    ...smorgBlock("smorg_women", "Women's Smorg", { key: "smorg_split", equals: "Separate buffets for men and women" }),

    // ── Additional guests — main course buffet ──
    { key: "addl", title: "Additional seated guests during the main course (buffet service)?", type: "choose", required: true,
      help: "Tables, linens & seating provided; buffet with chafers; no preset place settings or plated service.",
      options: [{ label: "Yes" }, { label: "No" }] },
    { key: "addl_pkg", title: "Additional Guests Buffet — Package", type: "choose",
      visible_if: { key: "addl", equals: "Yes" },
      options: [
        { label: "20 guests ($800) - 6 hot dishes", price: { model: "flat", amount: 800 } },
        { label: "30 guests ($1100) - 8 hot dishes", price: { model: "flat", amount: 1100 } },
        { label: "40 guests ($1400) - 10 hot dishes", price: { model: "flat", amount: 1400 } },
        { label: "50 guests ($1700) - 12 hot dishes", price: { model: "flat", amount: 1700 } },
        { label: "60 guests ($2000) - 14 hot dishes", price: { model: "flat", amount: 2000 } },
      ] },
    { key: "addl_main", title: "Additional Buffet — Main Dishes", type: "multi",
      visible_if: { key: "addl", equals: "Yes" },
      count: { by_answer: { key: "addl_pkg", map: {
        "20 guests ($800) - 6 hot dishes": 3, "30 guests ($1100) - 8 hot dishes": 4,
        "40 guests ($1400) - 10 hot dishes": 5, "50 guests ($1700) - 12 hot dishes": 6,
        "60 guests ($2000) - 14 hot dishes": 7 } } },
      options: BUFFET_MAINS.map((o) => o.price ? { label: o.label, price: { model: "per_person_qty", amount: 2.5 } } : o) },
    { key: "addl_app", title: "Additional Buffet — Appetizers", type: "multi",
      visible_if: { key: "addl", equals: "Yes" },
      count: { by_answer: { key: "addl_pkg", map: {
        "20 guests ($800) - 6 hot dishes": 2, "30 guests ($1100) - 8 hot dishes": 2,
        "40 guests ($1400) - 10 hot dishes": 3, "50 guests ($1700) - 12 hot dishes": 4,
        "60 guests ($2000) - 14 hot dishes": 5 } } },
      options: BUFFET_APPS },
    { key: "addl_side", title: "Additional Buffet — Side Dishes", type: "multi",
      visible_if: { key: "addl", equals: "Yes" },
      count: { by_answer: { key: "addl_pkg", map: {
        "20 guests ($800) - 6 hot dishes": 1, "30 guests ($1100) - 8 hot dishes": 2,
        "40 guests ($1400) - 10 hot dishes": 2, "50 guests ($1700) - 12 hot dishes": 2,
        "60 guests ($2000) - 14 hot dishes": 2 } } },
      options: BUFFET_SIDES },
    { key: "addl_sliders", title: "Additional Buffet — Slider Platters ($135/tray)", type: "qty",
      help: "Recommended 1 per 20 people. Brisket, Burger & Schnitzel sliders.",
      visible_if: { key: "addl", equals: "Yes" },
      options: [{ label: "Slider Platter", price: { model: "per_tray", amount: 135 } }] },
    { key: "addl_wraps", title: "Additional Buffet — Wrap Platters ($170/tray)", type: "qty",
      help: "Recommended 1 per 20 people. Brisket, Pastrami, Grilled Chicken & Schnitzel wraps.",
      visible_if: { key: "addl", equals: "Yes" },
      options: [{ label: "Wrap Platter", price: { model: "per_tray", amount: 170 } }] },
    { key: "addl_salads", title: "Additional Buffet — Salads", type: "multi", optional_group: true,
      visible_if: { key: "addl", equals: "Yes" }, options: FLAT_SALADS },
    { key: "addl_desserts", title: "Additional Buffet — Dessert Platters", type: "multi", optional_group: true,
      visible_if: { key: "addl", equals: "Yes" },
      options: [
        { label: "Large Fruit Platter", price: { model: "flat", amount: 125 } },
        { label: "Assorted Petite Four Platter", price: { model: "flat", amount: 125 } },
      ] },

    ...finalQuestions,
  ],
};

// ═══════════ TEMPLATE 2: SINGLE BUFFET ═══════════
const singleBuffet = {
  slug: "single_buffet",
  name: "Single Buffet Station",
  category: "Buffet Service",
  sort_order: 20,
  base: { adult_pp: 60, child_pp: 50, min_guests: 40, min_total: 2400,
    notes: "One buffet station shared between men and women. 2.5 hrs service included; overtime $200 per half hour. Children $50 up to age 8; 9+ are adults at $60." },
  sections: [
    ...roomSetup,
    ...childrenQuestions,
    { key: "mains", title: "Chicken or Beef — Choose 4 (chafing dishes)", type: "multi",
      count: { fixed: { min: 4, max: 4 } }, options: BUFFET_MAINS },
    { key: "apps", title: "Appetizers — Choose 4 (chafing dishes)", type: "multi",
      count: { fixed: { min: 4, max: 4 } }, options: BUFFET_APPS },
    { key: "sides", title: "Sides — Choose 2 (chafing dishes)", type: "multi",
      count: { fixed: { min: 2, max: 2 } }, options: BUFFET_SIDES },
    { key: "salads", title: "Salads — Choose 2 (bowls)", type: "multi", required: true,
      count: { fixed: { min: 2, max: 2 } }, options: BUFFET_SALADS },
    { key: "sliders_info", title: "Slider Platters — Included", type: "info",
      help: "Your buffet includes Brisket, Burger & Schnitzel sliders served on platters." },
    { key: "bread", title: "Bread Station", type: "choose", required: true,
      help: "Standard bread station with assorted dinner rolls included. Upgrades in Add-Ons.",
      options: [{ label: "Standard bread station — assorted dinner rolls" },
                { label: "Individual upgrade — select Bread & Chummus or Starter in Add-Ons" }] },
    { key: "plated_dessert", title: "Plated Dessert (included)", type: "choose", required: true,
      options: [...PLATED_DESSERTS, { label: "Dessert Station Upgrade (replaces plated dessert)" }] },
    { key: "refills_info", title: "Refills", type: "info",
      help: "Discretionary; kitchen refills as needed. Included: 40 guests none · 50→2 · 60→4 · 70→6 · 80→8 · 90→10 · 100→12. Additional refills billed per tray after the event." },
    ...buffetAddons("addon", null),
    ...finalQuestions,
  ],
};

// ═══════════ TEMPLATE 3: DOUBLE BUFFET ═══════════
const doubleBuffet = {
  slug: "double_buffet",
  name: "Double Buffet Stations (Men & Women)",
  category: "Buffet Service",
  sort_order: 21,
  base: { adult_pp: 70, child_pp: 50, min_guests: 40, min_total: 2800,
    notes: "Separate buffet stations for men and women. 2.5 hrs service included; overtime $200 per half hour. Children $50 up to age 8; 9+ are adults at $70." },
  sections: [
    ...roomSetup,
    ...childrenQuestions,
    ...sideBuffetBlock("men", "Men's"),
    ...buffetAddons("men_addon", "men"),
    ...sideBuffetBlock("women", "Women's"),
    ...buffetAddons("women_addon", "women"),
    ...finalQuestions,
  ],
};


// ═══════════ TEMPLATE 4: EVENT PRODUCTION & DÉCOR ═══════════
// Demonstrates the full party-planning scope: stations, passings, AV,
// décor, stationery, staffing — every pricing pattern a caterer needs.
// Prices are placeholders; edit them in Back Office → Menu Templates.
const production = {
  slug: "event_production",
  name: "Event Production & Décor (Add-On Sheet)",
  category: "Production & Party Planning",
  sort_order: 30,
  base: { adult_pp: 0, child_pp: 0,
    notes: "Add-on production sheet — combine with any menu. All prices editable per engagement." },
  sections: [
    { key: "stations", title: "Food Stations", type: "multi", optional_group: true,
      help: "Chef-attended stations, priced per station setup.",
      options: [
        { label: "Carving Station (chef attended)", price: { model: "per_tray", amount: 450, unit: "station" } },
        { label: "Sushi Station", price: { model: "per_tray", amount: 600, unit: "station" } },
        { label: "Salad Station", price: { model: "per_tray", amount: 250, unit: "station" } },
        { label: "Pasta / Action Station", price: { model: "per_tray", amount: 400, unit: "station" } },
        { label: "Dessert Station", price: { model: "per_tray", amount: 350, unit: "station" } },
      ] },
    { key: "stations_qty", title: "Station Quantities", type: "qty",
      help: "Enter how many of each selected station.",
      options: [
        { label: "Carving Station", price: { model: "per_tray", amount: 450, unit: "station" } },
        { label: "Sushi Station", price: { model: "per_tray", amount: 600, unit: "station" } },
        { label: "Salad Station", price: { model: "per_tray", amount: 250, unit: "station" } },
        { label: "Pasta / Action Station", price: { model: "per_tray", amount: 400, unit: "station" } },
        { label: "Dessert Station", price: { model: "per_tray", amount: 350, unit: "station" } },
      ] },
    { key: "passings", title: "Passed Hors d'Oeuvres", type: "toggle",
      help: "Butler-passed during reception, priced per person.",
      options: [{ label: "Add passed hors d'oeuvres service", price: { model: "per_person", amount: 9 } }] },
    { key: "av", title: "AV, Lighting & Staging", type: "qty", optional_group: true,
      options: [
        { label: "Pinspot", price: { model: "per_tray", amount: 35, unit: "fixture" } },
        { label: "Uplight", price: { model: "per_tray", amount: 25, unit: "fixture" } },
        { label: "Sound System", price: { model: "per_tray", amount: 250, unit: "system" } },
        { label: "Stage Section (4x8)", price: { model: "per_tray", amount: 150, unit: "section" } },
        { label: "Dance Floor Section", price: { model: "per_tray", amount: 100, unit: "section" } },
      ] },
    { key: "entertainment", title: "Entertainment & Media", type: "multi", optional_group: true,
      options: [
        { label: "DJ (4 hours)", price: { model: "flat", amount: 1200 } },
        { label: "Photographer", price: { model: "flat", amount: 1500 } },
        { label: "Videographer", price: { model: "flat", amount: 1800 } },
      ] },
    { key: "decor", title: "Décor & Florals", type: "qty", optional_group: true,
      options: [
        { label: "Floral Centerpiece", price: { model: "per_tray", amount: 85, unit: "arrangement" } },
        { label: "Statement Arrangement", price: { model: "per_tray", amount: 250, unit: "arrangement" } },
        { label: "Linen Upgrade", price: { model: "per_tray", amount: 18, unit: "table" } },
        { label: "Charger Plates", price: { model: "per_person", amount: 4 } },
      ] },
    { key: "stationery", title: "Stationery & Signage", type: "multi", optional_group: true,
      options: [
        { label: "Printed Menu Cards", price: { model: "per_person", amount: 1.5 } },
        { label: "Table Numbers", price: { model: "flat", amount: 40 } },
        { label: "Seating Chart Board", price: { model: "flat", amount: 75 } },
        { label: "Place Cards", price: { model: "per_person", amount: 1 } },
      ] },
    { key: "staffing", title: "Service & Staffing", type: "qty", optional_group: true,
      options: [
        { label: "Overtime", price: { model: "per_tray", amount: 200, unit: "half hour" } },
        { label: "Additional Server", price: { model: "per_tray", amount: 150, unit: "staff" } },
        { label: "Coat Check Attendant", price: { model: "per_tray", amount: 120, unit: "staff" } },
      ] },
    { key: "production_notes", title: "Production Notes", type: "text" },
  ],
};

// ── Emit SQL ──
function esc(j) { return JSON.stringify(j).replace(/'/g, "''"); }
const sql = `-- ═══════════════════════════════════════════════════════════════════════════
-- MENU TEMPLATES — Phase 2
-- Run once in the Supabase SQL Editor. Safe to re-run (upserts by slug).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists menu_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  active boolean default true,
  config jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table menu_templates enable row level security;
do $$ begin
  create policy "team full access" on menu_templates for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Charges gain a source so menu-generated lines can be regenerated without
-- touching manually added ones.
alter table charges add column if not exists source text default 'manual';

alter table menu_templates add column if not exists category text default 'General';
alter table menu_templates add column if not exists sort_order int default 100;

insert into menu_templates (slug, name, category, sort_order, config) values
('full_service', 'Full Service Plated Dinner', 'Plated Dinner Service', 10, '${esc(fullService)}'::jsonb),
('single_buffet', 'Single Buffet Station', 'Buffet Service', 20, '${esc(singleBuffet)}'::jsonb),
('double_buffet', 'Double Buffet Stations (Men & Women)', 'Buffet Service', 21, '${esc(doubleBuffet)}'::jsonb),
('event_production', 'Event Production & Décor (Add-On Sheet)', 'Production & Party Planning', 30, '${esc(production)}'::jsonb)
on conflict (slug) do update set name = excluded.name, category = excluded.category,
  sort_order = excluded.sort_order, config = excluded.config, updated_at = now();
`;
fs.writeFileSync(__dirname + "/../supabase/menu_templates.sql", sql);
console.log("Wrote supabase/menu_templates.sql",
  "| FS sections:", fullService.sections.length,
  "| SB:", singleBuffet.sections.length,
  "| DB:", doubleBuffet.sections.length);
