// harness/relationship.harness.tsx — PL-2's observable law, real components:
//   ?mode=one     — ONE unambiguous match: FOUND pre-selected, CREATE adjacent
//   ?mode=many    — TWO candidates: explicit choice, NOTHING pre-selected
//   ?mode=voices  — the ceremonial header + derived suggestions + the
//                   correction door, with window.__acts recording every
//                   ceremony fire (rendering fires nothing)
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { FoundOrCreate, RelationshipHeader, SuggestionRow, CorrectCitationDoor } from "@/components/RelationshipPanel";
import { Relationship, RelationshipMatch } from "@/lib/relationship";

const mode = new URLSearchParams(window.location.search).get("mode") ?? "one";
const acts: string[] = [];
(window as unknown as { __acts: string[] }).__acts = acts;

const goldbergs: Relationship = { id: "r1", name: "The Goldbergs", kind: "household",
  phones: ["7325551234"], emails: [], standing_notes: "keeps cholov yisroel" };
const steins: Relationship = { id: "r2", name: "The Steins", kind: "household",
  phones: ["7325551234"], emails: [], standing_notes: null };

const one: RelationshipMatch[] = [{ relationship: goldbergs, via: ["phone"] }];
const many: RelationshipMatch[] = [
  { relationship: goldbergs, via: ["phone"] },
  { relationship: steins, via: ["phone"] },
];

function DoorHost({ matches }: { matches: RelationshipMatch[] }) {
  // the caller's pre-selection law: unambiguous only
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const chosen = choice !== undefined ? choice
    : matches.length === 1 ? matches[0].relationship.id : null;
  return (
    <div style={{ padding: 24 }} data-door-chosen={chosen ?? "create"}>
      <FoundOrCreate matches={matches} chosen={chosen} onChoose={setChoice} />
    </div>
  );
}

function VoicesHost() {
  return (
    <div style={{ padding: 24 }} className="space-y-2">
      <RelationshipHeader rel={goldbergs} />
      <CorrectCitationDoor options={[goldbergs, steins]} currentId="r1" busy={false}
        onCorrect={(target, reason) => acts.push(`correct:${target}:${reason}`)} />
      <SuggestionRow label="Rachel Goldberg · Bar Mitzvah · 2019-05-12"
        detail="matched by phone/email" busy={false}
        onAdopt={() => acts.push("adopt:b-old-1")} />
      <SuggestionRow label="Goldberg office · Dinner · 2021-11-02"
        detail="matched by phone/email" busy={false}
        onAdopt={() => acts.push("adopt:b-old-2")} />
    </div>
  );
}

const style = document.createElement("link");
style.rel = "stylesheet"; style.href = "/app.css";
document.head.appendChild(style);
createRoot(document.getElementById("root")!).render(
  mode === "voices" ? <VoicesHost /> : <DoorHost matches={mode === "many" ? many : one} />);
