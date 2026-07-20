// The single-origin dev FRONT DOOR (Q-3 archie-persistence) — a dumb path router on :5173.
//
// Why a standalone proxy: NEITHER dev server can front the other.
//  - Vite can't front Astro: Astro requests its dev internals at root-relative paths
//    (/@vite, /@id, /src, /@fs) that a /viewer prefix proxy can't catch.
//  - Astro can't front Vite: Astro's dev server routes HTML NAVIGATIONS (Accept: text/html)
//    through its own router BEFORE Vite's proxy middleware — a browser visit to /studio/
//    404s while curl/fetch (no text/html Accept) proxies fine. Found the hard way.
//
// Routing: /studio* → Vite :5174 (Vite namespaces ALL its dev URLs under base, so the prefix
// captures everything); everything else → Astro :4321 (its root-relative internals included).
// WebSocket upgrades (both HMR clients) forward by the same rule. "/" redirects to /studio/.
import http from "node:http";
import httpProxy from "http-proxy";

const PORT = 5173;
const STUDIO = "http://localhost:5174";
const VIEWER = "http://localhost:4321";

const proxy = httpProxy.createProxyServer({});
const targetFor = (url) => (url.startsWith("/studio") ? STUDIO : VIEWER);

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(302, { Location: "/studio/" });
    res.end();
    return;
  }
  proxy.web(req, res, { target: targetFor(req.url) }, (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`front-door proxy: ${targetFor(req.url)} unreachable (${err.code ?? err.message}) — is that dev server up?`);
  });
});
server.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head, { target: targetFor(req.url) }, () => socket.destroy());
});
// Loopback ONLY. This proxy forwards /studio/* to vite unrewritten — including vite's /@fs path —
// so a wildcard bind puts the dev server's filesystem surface on the LAN. Every consumer reaches the
// front door by name at localhost (start.mjs, dev.sh, capture-screenshots, verify-*, README
// quickstart); nothing in this repo needs a non-loopback bind. "127.0.0.1" literal, not "localhost":
// listen() with a hostname goes through dns.lookup, so the bound interface would depend on the
// machine's resolver. Do not drop the host argument.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`front door  → http://localhost:${PORT}  (/studio/ → ${STUDIO}, everything else → ${VIEWER})`);
});
