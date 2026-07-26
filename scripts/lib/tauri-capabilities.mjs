// Desktop capability gate (Archie-91e7).
//
// WHY THIS EXISTS. `TauriFilesystem` commits every durable write with a same-directory
// temp-then-rename (`packages/render-core/src/fs/tauri.ts` — TauriFile.close). Tauri v2 refuses any
// command a capability does not grant. The shipped manifest omitted `fs:allow-rename`, so EVERY file
// write failed at its commit point: measured on a native build, first boot produced 18 directories,
// 4 files, and ZERO bytes of content — `library.json` empty, ingested assets empty — behind a soft
// "Retry save" banner. 100% of authored work lost, with the app looking healthy.
//
// WHY NO EXISTING GATE COULD SEE IT. `fs/tauri.test.ts` proves the backend against a **node:fs**
// conformance bridge, and node:fs has no permission system, so `rename` always succeeds there. The
// suite answers "are the filesystem semantics right"; it never asks "is this command permitted in the
// packaged app". Same family as `.claude/rules/bound-fetch-defaults.md` (Node more permissive than the
// browser). Nothing headless can reach this class — it needs the real webview, which is why the check
// is structural rather than behavioural.
//
// WHY IT CANNOT ROT. The method list is DERIVED from the `TauriFsBridge` interface source, not
// hand-listed. A new bridge method with no entry in REQUIRED_PERMISSIONS is a hard FAILURE
// ("unmapped"), so growing the seam forces an explicit decision about what it needs granted. That is
// the property `.claude/rules/post-review-fixes-are-unreviewed.md` demands of a gate's reference: it
// must not be satisfiable by quietly moving it. A hand-maintained list of METHODS would have been a
// tautology; a hand-maintained map keyed BY the derived list is not, because the keys are checked.

/**
 * What each `TauriFsBridge` method needs granted in `src-tauri/capabilities/default.json`.
 *
 * An empty array means "needs no fs permission", and every such entry carries its reason — an
 * unexplained empty array is indistinguishable from an oversight.
 */
export const REQUIRED_PERMISSIONS = {
  readFile: ["fs:allow-read-file"],
  writeFile: ["fs:allow-write-file"],
  // open() returns a handle the streaming write path drives chunk-by-chunk, so the handle's own
  // `write` command is needed too — `fs:allow-open` alone yields a handle that cannot be written.
  open: ["fs:allow-open", "fs:allow-write"],
  rename: ["fs:allow-rename"],
  mkdir: ["fs:allow-mkdir"],
  readDir: ["fs:allow-read-dir"],
  remove: ["fs:allow-remove"],
  exists: ["fs:allow-exists"],
  stat: ["fs:allow-stat"],
  // convertFileSrc mints an asset:// URL. That is the asset protocol (tauri.conf.json
  // `app.security.assetProtocol`), not an fs command, so it needs no fs permission.
  resolveUrl: [],
};

/**
 * Method names declared on the `TauriFsBridge` interface, read from its source.
 *
 * Deliberately a regex over the interface BODY rather than a TS parse: this script runs on bare node
 * in CI with no typescript dependency. The body is isolated first so unrelated interfaces in the same
 * file cannot contribute names, and comments are stripped so prose mentioning `rename(` cannot either.
 *
 * @param {string} source contents of packages/render-core/src/fs/tauri.ts
 * @returns {string[]}
 */
export function bridgeMethods(source) {
  const start = source.indexOf("export interface TauriFsBridge {");
  if (start === -1) throw new Error("TauriFsBridge interface not found — did the seam move?");
  const body = source.slice(start);
  const end = body.indexOf("\n}");
  if (end === -1) throw new Error("TauriFsBridge interface body is unterminated");

  const withoutComments = body
    .slice(0, end)
    .replace(/\/\*[\s\S]*?\*\//g, "") // block/JSDoc comments
    .replace(/\/\/.*$/gm, ""); // line comments

  const names = [];
  // A member declaration at interface indentation: `  name(args): Ret;`
  for (const m of withoutComments.matchAll(/^\s{2}([a-zA-Z_$][\w$]*)\s*\(/gm)) names.push(m[1]);
  if (names.length === 0) throw new Error("TauriFsBridge parsed to zero methods — parser is wrong");
  return names;
}

/**
 * Permission identifiers a capability manifest grants. Entries are either bare strings
 * (`"fs:allow-rename"`) or objects carrying an `identifier` plus scope/allow data (`fs:scope`,
 * `opener:allow-open-url`); both forms count as granted.
 *
 * @param {{permissions?: unknown[]}} manifest parsed capabilities/default.json
 * @returns {Set<string>}
 */
export function grantedPermissions(manifest) {
  const out = new Set();
  for (const p of manifest.permissions ?? []) {
    if (typeof p === "string") out.add(p);
    else if (p && typeof p === "object" && typeof p.identifier === "string") out.add(p.identifier);
  }
  return out;
}

/**
 * @param {string} bridgeSource contents of packages/render-core/src/fs/tauri.ts
 * @param {object} manifest parsed src-tauri/capabilities/default.json
 * @returns {{ok: boolean, methods: string[], unmapped: string[], missing: {method: string, permission: string}[]}}
 */
export function auditCapabilities(bridgeSource, manifest) {
  const methods = bridgeMethods(bridgeSource);
  const granted = grantedPermissions(manifest);

  const unmapped = methods.filter((m) => !(m in REQUIRED_PERMISSIONS));
  const missing = [];
  for (const method of methods) {
    for (const permission of REQUIRED_PERMISSIONS[method] ?? []) {
      if (!granted.has(permission)) missing.push({ method, permission });
    }
  }
  return { ok: unmapped.length === 0 && missing.length === 0, methods, unmapped, missing };
}

/** Human-readable report for the CLI. @param {ReturnType<typeof auditCapabilities>} r */
export function formatReport(r) {
  const lines = [`TauriFsBridge methods checked: ${r.methods.length} (${r.methods.join(", ")})`];
  for (const m of r.unmapped) {
    lines.push(
      `UNMAPPED  ${m}() — new bridge method with no entry in REQUIRED_PERMISSIONS.`,
      `          Decide what it needs granted and add it (an empty array is fine WITH a reason).`,
    );
  }
  for (const { method, permission } of r.missing) {
    lines.push(
      `MISSING   ${permission} — required by ${method}(), absent from capabilities/default.json.`,
      `          Tauri denies ungranted commands at runtime; this fails SILENTLY in the packaged app.`,
    );
  }
  lines.push(r.ok ? "ok — every bridge method is granted" : "FAILED");
  return lines.join("\n");
}
