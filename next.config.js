/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // v298 · /today is canonical. A page-level redirect on a statically
  // prerendered route is delivered INSIDE the RSC payload — the response is 200
  // and the browser does not move — so the legacy path needs a redirect that
  // resolves before routing begins. This emits a real 308 with a Location
  // header. The page-level permanentRedirect in
  // src/app/operations/today/page.tsx is retained as defense-in-depth for any
  // request that reaches the route directly.
  async redirects() {
    return [
      { source: "/operations/today", destination: "/today", permanent: true },
    ];
  },
};
