// HttpFilesystem conformance — the read-only applicable subset of the shared seam contract
// (conformance.ts runReadConformance), served from a stubbed static host: a fixture map of
// tree-relative paths → bodies, exactly what a published tree on GH Pages / any static host is.
// The same subset runs against Memory/Zip (conformance.test.ts), so green here proves the HTTP
// backend's reads are interchangeable with the writable backends' — not merely self-consistent.

import { runReadConformance, type SeedFiles } from "./conformance.js";
import { HttpFilesystem } from "./http.js";

const BASE = "https://host/published/";

/** A static host over a seeded fixture tree: routed paths serve their body, everything else 404s. */
function staticHostFetch(files: SeedFiles): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (!url.startsWith(BASE)) return new Response("bad host", { status: 404 });
    const path = decodeURIComponent(url.slice(BASE.length));
    const body = files[path];
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(typeof body === "string" ? body : (body.slice() as unknown as BodyInit));
  }) as typeof fetch;
}

runReadConformance("HttpFilesystem (stubbed static host)", (files) => {
  return new HttpFilesystem(BASE, { fetch: staticHostFetch(files) });
});
