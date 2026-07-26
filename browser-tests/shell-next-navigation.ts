/** v290 harness stub for next/navigation. The active path is supplied as
 *  ?path=... so active-pill behaviour is testable without a Next router. */
export function usePathname(): string {
  const p = new URLSearchParams(window.location.search).get("path");
  return p || "/";
}
export function useRouter() {
  return { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
}
export function useSearchParams() { return new URLSearchParams(window.location.search); }
export function useParams(): Record<string, string> { return {}; }
export function redirect(_to: string): never { throw new Error("REDIRECT"); }
