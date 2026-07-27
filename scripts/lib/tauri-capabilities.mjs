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

// ---------------------------------------------------------------------------------------------
// SCOPE (Archie-7b48). A second, independent way the manifest can be wrong — and the permission
// audit above is structurally blind to it.
//
// Granting `fs:allow-exists` says the COMMAND may run. It says nothing about WHICH PATHS it may run
// on. Tauri matches scope globs with a leading-dot rule: `**` does NOT match a path component that
// begins with a dot. `$APPDATA/**` therefore covers `library/library.json` but NOT
// `library/exhibits/<slug>/assets/.bake-schema` — note it covers the dots in `.local` only because
// `$APPDATA` expands to a LITERAL path, so no wildcard has to match them. Measured on a packaged
// build: `fs.exists()` on that marker was refused as `forbidden path`, the asset save job rejected
// AFTER its bytes had already landed, and the ingest reported "couldn't store on this device — free
// some space" on a disk with ~1 TB free. Every permission the audit above checks was granted.
//
// DERIVED, not hand-listed, for the same reason the method list is: the dot-segments come from the
// app's own `getFile(…)` / `getDirectory(…)` call sites. Writing a new hidden file or dotdir with no
// matching scope entry is then a hard failure rather than a silent runtime refusal.

/** A `.dotname` path segment — a hidden FILE or DIRECTORY the app asks the filesystem for. */
const DOT_SEGMENT = /^\.[A-Za-z0-9][\w.-]*$/;

/**
 * Dot-prefixed path segments the app hands to `getFile` / `getDirectory`.
 *
 * Two forms are recognised, because both occur: a bare literal (`getDirectory(".archie-cache", …)`)
 * and a module const (`const SCHEMA_MARKER = ".bake-schema"` → `getFile(SCHEMA_MARKER, …)`). The
 * const indirection is followed ONE level, per file — enough for the real call sites and short of
 * pretending this is a type checker.
 *
 * Deliberately scoped to those two method names rather than "any string starting with a dot": file
 * EXTENSIONS (".json", ".jpg") and the temp-write SUFFIX (".tmp-") are dot-strings that are not path
 * segments, and a check that flagged them would be noise. A suffix is safe anyway — the leading-dot
 * rule is about a component's FIRST character.
 *
 * @param {{path: string, text: string}[]} sources app + render-core TypeScript sources
 * @returns {{segment: string, path: string}[]} unique segments with the file that asks for them
 */
export function dotPathSegments(sources) {
  const found = new Map();
  for (const { path, text } of sources) {
    const consts = new Map();
    for (const m of text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["'](\.[^"']*)["']/g)) {
      consts.set(m[1], m[2]);
    }
    for (const m of text.matchAll(/\bgetFile|\bgetDirectory/g)) {
      // Read the first argument as written: a quoted literal, or a bare identifier.
      const rest = text.slice(m.index + m[0].length);
      const arg = /^\s*\(\s*(?:["'](?<lit>[^"']*)["']|(?<ident>[A-Za-z_$][\w$]*))/u.exec(rest);
      if (!arg?.groups) continue;
      const value = arg.groups.lit ?? consts.get(arg.groups.ident ?? "");
      if (typeof value === "string" && DOT_SEGMENT.test(value) && !found.has(value)) {
        found.set(value, { segment: value, path });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.segment.localeCompare(b.segment));
}

/**
 * Scope roots the manifest wildcards over, e.g. `$APPDATA/**` → `$APPDATA`.
 *
 * The root must be LITERAL — a prefix containing no wildcard of its own. Without that condition the
 * dot-globs this module requires (`$APPDATA/**\/.*\/**`) also end in `/**`, so they would be read as
 * roots needing their own dot-coverage, and the requirement would regress infinitely. Caught by the
 * gate failing against a manifest that was already correct, which is the good direction to fail in.
 */
export function scopeWildcardRoots(manifest) {
  const roots = [];
  for (const p of manifest.permissions ?? []) {
    if (!p || typeof p !== "object" || p.identifier !== "fs:scope") continue;
    for (const a of p.allow ?? []) {
      const m = typeof a?.path === "string" ? /^([^*]*)\/\*\*$/.exec(a.path) : null;
      if (m) roots.push(m[1]);
    }
  }
  return roots;
}

/** Every allow-path in the manifest's fs:scope, verbatim. */
function scopePaths(manifest) {
  const out = new Set();
  for (const p of manifest.permissions ?? []) {
    if (!p || typeof p !== "object" || p.identifier !== "fs:scope") continue;
    for (const a of p.allow ?? []) if (typeof a?.path === "string") out.add(a.path);
  }
  return out;
}

/**
 * If the app asks for ANY dot-segment, then every wildcarded scope root must also admit dot-paths —
 * both a hidden file (`<root>/**\/.*`) and a hidden directory's contents (`<root>/**\/.*\/**`).
 *
 * @returns {{ok: boolean, segments: {segment: string, path: string}[], missing: {root: string, glob: string}[]}}
 */
export function auditScope(sources, manifest) {
  const segments = dotPathSegments(sources);
  const missing = [];
  if (segments.length > 0) {
    const have = scopePaths(manifest);
    for (const root of scopeWildcardRoots(manifest)) {
      for (const glob of [`${root}/**/.*`, `${root}/**/.*/**`]) {
        if (!have.has(glob)) missing.push({ root, glob });
      }
    }
  }
  return { ok: missing.length === 0, segments, missing };
}

/** Human-readable report for the scope audit. @param {ReturnType<typeof auditScope>} r */
export function formatScopeReport(r) {
  const lines = [
    `hidden path segments the app requests: ${r.segments.length}` +
      (r.segments.length ? ` (${r.segments.map((s) => s.segment).join(", ")})` : ""),
  ];
  for (const { root, glob } of r.missing) {
    lines.push(
      `MISSING   ${glob} — ${root}/** does not admit dot-paths.`,
      `          Tauri's scope globs will not match a component starting with "." — the command is`,
      `          granted but the PATH is refused, and the failure lands AFTER bytes are written.`,
    );
  }
  lines.push(r.ok ? "ok — hidden paths are in scope" : "FAILED");
  return lines.join("\n");
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
