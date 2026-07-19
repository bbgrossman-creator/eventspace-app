// v239 — Company identity & policy storage: app_settings, no migration.
// Keys: 'company.identity' (fact values) · 'company.policy' (visibility).
// Resilient before seeding: absent keys mean an unsaid company.
import { supabase } from "./supabase";
import { CompanyIdentity, PublicationPolicy } from "./identity";

export async function getCompanyIdentity(): Promise<{ identity: CompanyIdentity; policy: PublicationPolicy }> {
  try {
    const { data } = await supabase.from("app_settings").select("key,value")
      .in("key", ["company.identity", "company.policy"]);
    const val = (k: string) => data?.find((r: { key: string; value: string }) => r.key === k)?.value;
    const parse = <T,>(s: string | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
    return { identity: parse<CompanyIdentity>(val("company.identity"), {}), policy: parse<PublicationPolicy>(val("company.policy"), {}) };
  } catch { return { identity: {}, policy: {} }; }
}

async function upsert(key: string, value: string): Promise<boolean> {
  try {
    const { data } = await supabase.from("app_settings").select("key").eq("key", key).maybeSingle();
    if (data) { const { error } = await supabase.from("app_settings").update({ value }).eq("key", key); return !error; }
    const { error } = await supabase.from("app_settings").insert({ key, value }); return !error;
  } catch { return false; }
}

export const saveCompanyIdentity = (identity: CompanyIdentity): Promise<boolean> =>
  upsert("company.identity", JSON.stringify(identity));
export const saveCompanyPolicy = (policy: PublicationPolicy): Promise<boolean> =>
  upsert("company.policy", JSON.stringify(policy));
