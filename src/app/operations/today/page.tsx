import { permanentRedirect } from "next/navigation";

/** v298 · /operations/today — retained as a permanent (308) server redirect to
 *  /today, which is now canonical.
 *
 *  `permanentRedirect` rather than `redirect`: v290's redirect ran the other
 *  way and used `redirect` (307) while its own comment called the route
 *  permanent. v298 states the intent in the API — the move is final, and caches
 *  and crawlers should treat it as such.
 *
 *  In the tested Next.js 14 production build, the page-level redirect on this
 *  statically prerendered route was carried in the RSC payload rather than
 *  emitted as an HTTP Location redirect: the response was 200 and the browser
 *  did not move.
 *
 *  next.config.js therefore carries the AUTHORITATIVE browser redirect — its
 *  `redirects()` entry resolves before routing and emits a real 308 with a
 *  Location header.
 *
 *  The `permanentRedirect` below remains executable DEFENSE-IN-DEPTH if a
 *  request ever reaches this route component.
 */
export default function OperationsTodayRedirect() {
  permanentRedirect("/today");
}
