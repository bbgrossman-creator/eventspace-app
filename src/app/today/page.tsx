import { redirect } from "next/navigation";

/** v290 · /today — retained as a permanent server redirect to
 *  /operations/today.
 *
 *  v288a mounted Operations Today here, and the surface was never reachable
 *  from the shell — only by typing the URL. v290 gives it a home under
 *  Operations. This route stays so that anything already pointing at /today
 *  keeps working; it renders nothing and holds no opinion about the surface.
 *
 *  A server redirect is used deliberately in preference to a `redirects()`
 *  entry in next.config: no next.config exists in this repository, and v290 is
 *  registered as an application-only slice with no build-configuration change.
 */
export default function TodayRedirect() {
  redirect("/operations/today");
}
