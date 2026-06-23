"use client";
import { useEffect, useState } from "react";
import { loadStaffAndMode, verifyApproval, StaffMember, IdMode } from "@/lib/staffApproval";

/** Renders the right identification UI based on the back-office mode and reports
 *  a verified approver name (or null) up to the parent via onChange. */
export default function ApprovalField({
  label = "Confirmed by",
  onChange,
}: {
  label?: string;
  onChange: (verifiedName: string | null) => void;
}) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [mode, setMode] = useState<IdMode>("free_text");
  const [selectedId, setSelectedId] = useState("");
  const [typedName, setTypedName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { loadStaffAndMode().then(({ staff, mode }) => { setStaff(staff); setMode(mode); }); }, []);

  // Re-verify whenever inputs change, reporting result upward.
  useEffect(() => {
    const r = verifyApproval(mode, staff, selectedId, typedName, pin);
    setError(r.ok ? "" : "");
    onChange(r.ok ? r.name! : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, staff, selectedId, typedName, pin]);

  return (
    <div>
      <label className="label">{label} <span className="text-red-500">*</span></label>
      {mode === "free_text" && (
        <input className="field" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Your name" />
      )}
      {(mode === "dropdown" || mode === "pin") && (
        <div className="flex gap-2">
          <select className="field flex-1" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">— Select —</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {mode === "pin" && (
            <input className="field w-28" type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
