/** v290 harness stub for next/link — a plain anchor, so hrefs are assertable. */
import type { ReactNode } from "react";
export default function Link(
  { href, children, ...rest }: { href: string; children?: ReactNode } & Record<string, unknown>,
) {
  return <a href={href} {...(rest as object)}>{children}</a>;
}
