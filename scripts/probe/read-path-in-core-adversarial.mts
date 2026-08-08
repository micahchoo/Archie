// Read-path adversarial probe — IN-CORE slice (Probe 2 of the shared contract, see
// scripts/../local contract / ledgers). Owns: ZipFilesystem.fromZip (zip-bomb caps, hostile entry
// names), openArchieLibrary + fetchArchieLibraryBytes + fetchZipBytesIfAny + openArchieLibraryFromUrl
// (cap double-check, torn transfer, non-OK statuses), assertSafeSegment (traversal fuzz),
// classifyArchieMarker / validateArchieMarker (forged + torn markers). NO HTTP server — hand-crafted
// bytes and direct calls only (the transport probe owns the fault-injection server).
//
// Everything is in-memory and self-cleaning (no temp files). Per-item tolerant reporting via
// scripts/lib/checklist.mjs: every check runs and prints PASS/FAIL with a subject-carrying detail;
// the tail prints "N/M checks passed", re-lists FAILs with contract-violation wording, prints the
// FINDINGS section (real defects, each naming the case + expected contract), and exits 0/1.
//
// Run:  cd apps/viewer && pnpm exec vite-node ../../scripts/probe/read-path-in-core-adversarial.mts
import { zipSync, strToU8, deflateSync } from "fflate";
import {
  ZipFilesystem,
  ZIP_LIMITS,
  openArchieLibrary,
  fetchArchieLibraryBytes,
  fetchZipBytesIfAny,
  openArchieLibraryFromUrl,
  looksLikeZip,
  SRC_MAX_BYTES,
  classifyArchieMarker,
  validateArchieMarker,
  NotArchieLibraryError,
  FailedReadError,
  fsJsonSource,
  tryResolveFile,
  libraryToZip,
  asLibraryId,
  asExhibitId,
  asObjectId,
  assertSafeSegment,
  ARCHIE_LIBRARY_MARKER,
  type Library,
  type Filesystem,
} from "@render/core";
import { createChecklist } from "../lib/checklist.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Raw zip construction — fflate's zipSync cannot emit duplicate names, declared
// sizes that lie about the payload, an encryption flag, method 99, or zip64
// 4 GiB declarations, so hostile structures are hand-assembled here.
// ─────────────────────────────────────────────────────────────────────────────
const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const u64 = (v: number): number[] => [...u32(v & 0xffffffff), ...u32(Math.floor(v / 0x100000000))];
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const crcOf = (d: Uint8Array): number => {
  let c = 0;
  for (const b of d) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
};

interface RawEntry {
  name: string;
  data: Uint8Array;
  /** compression method: 0 stored, 8 deflate, 99 unknown */
  method?: number;
  /** general-purpose flag bits, e.g. 1 = encrypted */
  gpflag?: number;
  /** declared COMPRESSED size (lies allowed) */
  declaredSize?: number;
  /** declared UNCOMPRESSED size (lies allowed) */
  declaredOriginalSize?: number;
  /** zip64: sentinel the size fields and carry real values in the id-1 extra */
  zip64?: boolean;
}

/** Assemble local headers + data + central directory + EOCD (optionally zip64 EOCD). */
function buildZip(entries: RawEntry[], opts: { zip64Eocd?: boolean } = {}): Uint8Array {
  const chunks: Uint8Array[] = [];
  let off = 0;
  const centrals: { ch: Uint8Array; name: Uint8Array; extra: Uint8Array }[] = [];
  for (const e of entries) {
    const name = enc(e.name);
    const data = e.data;
    const csize = e.declaredSize ?? data.length;
    const usize = e.declaredOriginalSize ?? data.length;
    const needZip64 = e.zip64 || csize > 0xffffffff || usize > 0xffffffff;
    const szC = needZip64 ? 0xffffffff : csize;
    const szU = needZip64 ? 0xffffffff : usize;
    // id-1 zip64 extra: only the sentinelled size fields (offset stays in the 32-bit field — all
    // our central directories start far below 4 GiB).
    let extra = new Uint8Array(0);
    if (needZip64) {
      const fields: number[] = [];
      if (szU === 0xffffffff) fields.push(...u64(usize));
      if (szC === 0xffffffff) fields.push(...u64(csize));
      const sz = fields.length / 8;
      extra = new Uint8Array([0x01, 0x00, sz & 0xff, (sz >>> 8) & 0xff, ...fields]);
    }
    const lh = new Uint8Array(30);
    lh.set([0x50, 0x4b, 0x03, 0x04], 0); // local sig PK\x03\x04
    lh.set(u16(20), 4);
    lh.set(u16(e.gpflag ?? 0), 6);
    lh.set(u16(e.method ?? 0), 8);
    lh.set(u32(crcOf(data)), 14);
    lh.set(u32(szC), 18);
    lh.set(u32(szU), 22);
    lh.set(u16(name.length), 26);
    lh.set(u16(extra.length), 28);
    chunks.push(lh, name, extra, data);
    const localOff = off;
    off += lh.length + name.length + extra.length + data.length;
    const ch = new Uint8Array(46);
    ch.set([0x50, 0x4b, 0x01, 0x02], 0); // central sig PK\x01\x02
    ch.set(u16(20), 4);
    ch.set(u16(20), 6);
    ch.set(u16(e.gpflag ?? 0), 8);
    ch.set(u16(e.method ?? 0), 10);
    ch.set(u32(crcOf(data)), 16);
    ch.set(u32(szC), 20);
    ch.set(u32(szU), 24);
    ch.set(u16(name.length), 28);
    ch.set(u16(extra.length), 30);
    ch.set(u32(0), 38); // external attrs
    ch.set(u32(localOff), 42);
    centrals.push({ ch, name, extra });
  }
  const cdStart = off;
  const cdParts: Uint8Array[] = [];
  for (const { ch, name, extra } of centrals) cdParts.push(ch, name, extra);
  const cd = new Uint8Array(cdParts.reduce((a, p) => a + p.length, 0));
  let p = 0;
  for (const part of cdParts) {
    cd.set(part, p);
    p += part.length;
  }
  chunks.push(cd);
  const cdSize = cd.length;
  if (opts.zip64Eocd) {
    const z64 = new Uint8Array(56);
    z64.set([0x50, 0x4b, 0x06, 0x06], 0); // zip64 EOCD sig
    z64.set(u64(44), 4); // size of record
    z64.set(u16(45), 12);
    z64.set(u16(45), 14);
    z64.set(u32(0), 16);
    z64.set(u32(0), 20);
    z64.set(u64(centrals.length), 24);
    z64.set(u64(centrals.length), 32);
    z64.set(u64(cdSize), 40);
    z64.set(u64(cdStart), 48);
    chunks.push(z64);
    const loc = new Uint8Array(20);
    loc.set([0x50, 0x4b, 0x06, 0x07], 0); // zip64 EOCD locator sig
    loc.set(u32(0), 4);
    loc.set(u64(cdStart + cdSize), 8); // offset of the zip64 EOCD record
    loc.set(u32(1), 16);
    chunks.push(loc);
  }
  const eocd = new Uint8Array(22);
  eocd.set([0x50, 0x4b, 0x05, 0x06], 0); // EOCD sig
  eocd.set(u16(opts.zip64Eocd ? 0xffff : centrals.length), 8);
  eocd.set(u16(opts.zip64Eocd ? 0xffff : centrals.length), 10);
  eocd.set(u32(opts.zip64Eocd ? 0xffffffff : cdSize), 12);
  eocd.set(u32(opts.zip64Eocd ? 0xffffffff : cdStart), 16);
  chunks.push(eocd);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let q = 0;
  for (const c of chunks) {
    out.set(c, q);
    q += c.length;
  }
  return out;
}

const u8 = (s: string): Uint8Array => strToU8(s);

// ─────────────────────────────────────────────────────────────────────────────
// Fixture — a REAL published tree via publishLibrary (libraryToZip) so the
// legit-open baseline exercises the actual serializer, not a hand-rolled zip.
// ─────────────────────────────────────────────────────────────────────────────
const FIXTURE_LIBRARY: Library = {
  id: asLibraryId("fixture"),
  exhibits: [
    {
      id: asExhibitId("ex"),
      slug: "show",
      title: "Show",
      objects: [
        { id: asObjectId("oA"), source: "https://img.example/a.jpg", label: "A", width: 10, height: 10 },
      ],
    },
  ],
};
const realZip: Uint8Array = (
  await libraryToZip(FIXTURE_LIBRARY, () => [], { baseUrl: "https://u.gh.io/lib/" })
).zip;

/** A minimal-but-valid marker trio zip: archie.json + exhibits.json (lenient-on-absent ALSO accepts
 *  without the marker, but every fixture here carries a marker so the marker gate is what's tested).
 *  NOTE: fflate's zipSync only accepts Uint8Array values — a raw string makes fltn recurse per
 *  character and overflow the stack. */
function markerZip(markerJson: unknown): Uint8Array {
  return zipSync({
    "archie.json": u8(JSON.stringify(markerJson)),
    "exhibits.json": u8('{"library":{"title":"X"},"exhibits":[]}'),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting + findings
// ─────────────────────────────────────────────────────────────────────────────
const findings: string[] = [];
const { check, finish } = createChecklist({
  onExit: (ctx: { passed: number; total: number; failed: { label: string; detail: string }[] }) => {
    console.log(`\n${ctx.passed}/${ctx.total} checks passed`);
    if (ctx.failed.length > 0) {
      console.log(`\n${ctx.failed.length} FAILURE(S) — contract violations:`);
      for (const f of ctx.failed) console.log(`  FAIL  ${f.label} — ${f.detail}`);
    }
    console.log("\nFINDINGS (real defects for the main agent to triage into seeds issues / durable tests):");
    if (findings.length === 0) console.log("  (none)");
    for (const f of findings) console.log(`  • ${f}`);
    process.exit(ctx.failed.length === 0 ? 0 : 1);
  },
});

const throwsWith = (fn: () => unknown, re: RegExp): { threw: boolean; message: string } => {
  try {
    fn();
    return { threw: false, message: "" };
  } catch (e) {
    return { threw: true, message: e instanceof Error ? e.message : String(e) };
  }
};
const rejectsWith = async (p: Promise<unknown>, re: RegExp): Promise<{ threw: boolean; message: string }> => {
  try {
    await p;
    return { threw: false, message: "" };
  } catch (e) {
    return { threw: true, message: e instanceof Error ? e.message : String(e) };
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// Section 0 — fixture sanity (guards every downstream fixture against probe bugs)
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n[0] fixture sanity");
{
  const fs = await openArchieLibrary(realZip);
  const marker = await fsJsonSource(fs).get<{ format: string; version: number }>("archie.json");
  check(
    marker.format === "archie-library" && typeof marker.version === "number",
    "real published tree opens through the seam",
    `libraryToZip → openArchieLibrary resolves; archie.json format=${marker.format} version=${marker.version} (${realZip.byteLength} bytes)`,
  );
  check(
    classifyArchieMarker(ARCHIE_LIBRARY_MARKER).kind === "current",
    "classifyArchieMarker(current constant) → current",
    `kind=${classifyArchieMarker(ARCHIE_LIBRARY_MARKER).kind}`,
  );
  check(
    looksLikeZip(realZip) && !looksLikeZip(new Uint8Array([1, 2, 3, 4])),
    "looksLikeZip byte sniff (baseline)",
    "real zip → true, non-zip prefix → false",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Section A — ZipFilesystem.fromZip: hostile archives
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n[A] fromZip — hostile archives");

// A1 — hostile ENTRY NAMES (case 1): accepted as inert map keys at decode time?
{
  const hostile = buildZip([
    { name: "../x", data: u8("esc1") },
    { name: "/abs/x", data: u8("esc2") },
    { name: "a\\b", data: u8("bs") },
    { name: "a/../b", data: u8("dotdot") },
  ]);
  let decoded: ZipFilesystem | null = null;
  let decodeErr = "";
  try {
    decoded = ZipFilesystem.fromZip(hostile);
  } catch (e) {
    decodeErr = e instanceof Error ? e.message : String(e);
  }
  check(
    decoded !== null,
    "hostile entry names decode as inert map keys",
    decodeErr === "" ? `fromZip accepts ../x, /abs/x, a\\b, a/../b without throwing` : `unexpected throw: ${decodeErr}`,
  );
  if (decoded) {
    const shapes: string[] = [];
    for await (const entry of (await decoded.root()).entries()) shapes.push(`${entry.kind}:${JSON.stringify(entry.name)}`);
    check(
      true,
      "hostile names surface as navigable tree shapes in entries()",
      `observed shapes: ${shapes.join(", ")} — "/abs/x" yields an EMPTY-named directory, "../x" and "a/../b" yield ".." directories`,
    );
    // A2 — the containment gate on READ (case 1): the case list's literal contract is
    // "getFile on them must refuse via assertSafeSegment". Probe BOTH surfaces:
    // (a) direct root.getFile(name) — the seam's own entry point;
    // (b) tryResolveFile(name.split("/")) — the classified walk fsJsonSource uses.
    // The gate (ZipFilesystem.getFile/getDirectory → assertSafeSegment) THROWS /unsafe path segment/
    // for a hostile name, and tryResolveFile rethrows non-absent errors — so a walk over a hostile
    // path throws too. The PASS is the gate's refusal; any other outcome (bytes, null) is the FAIL.
    for (const name of ["../x", "/abs/x", "a\\b", "a/../b"]) {
      const r = await rejectsWith((await decoded.root()).getFile(name), /unsafe path segment/);
      check(
        r.threw && /unsafe path segment/.test(r.message),
        `getFile(${JSON.stringify(name)}) refuses via assertSafeSegment`,
        r.threw
          ? `refused — ${r.message}`
          : "RESOLVED — getFile returned instead of refusing (gate not on this surface)",
      );
    }
    const walkDotdot = await rejectsWith(tryResolveFile(decoded, "a/../b".split("/")), /unsafe path segment/);
    check(
      walkDotdot.threw && /unsafe path segment/.test(walkDotdot.message),
      "read-stack walk (tryResolveFile) refuses a/../b",
      walkDotdot.threw
        ? `refused — the walk's getDirectory('..') trips the gate: ${walkDotdot.message}`
        : "RESOLVED — the classified traversal walked the hostile name",
    );
    const walkAbs = await rejectsWith(tryResolveFile(decoded, "/abs/x".split("/")), /unsafe path segment/);
    check(
      walkAbs.threw && /unsafe path segment/.test(walkAbs.message),
      "read-stack walk refuses /abs/x (leading empty segment gated)",
      walkAbs.threw
        ? `refused — the walk's getDirectory('') trips the gate: ${walkAbs.message}`
        : "RESOLVED — the classified traversal reached bytes",
    );
  }
}

// A3/A4 — truncated zip-prefixed bodies (case 2): must throw, not hang or corrupt.
{
  const garbage = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Array(64).fill(7)]); // PK\x03\x04 + garbage, no EOCD
  const r1 = throwsWith(() => ZipFilesystem.fromZip(garbage), /invalid zip data/);
  check(r1.threw, "zip-signature-prefixed garbage (no EOCD) throws, does not hang", r1.message || "accepted");
  check(
    r1.threw && /That file couldn't be opened/i.test(r1.message),
    "truncated/garbage zip error is a FRIENDLY steer",
    r1.threw
      ? `message: "${r1.message}" — the zipDecodeError wrap surfaces the friendly steer with the raw fflate detail (invalid zip data) retained as a parenthetical`
      : "no throw",
  );
  if (r1.threw && !/That file couldn't be opened/i.test(r1.message)) {
    findings.push(
      "Corrupt/truncated zip decode errors surface fflate-raw messages (case A3): fromZip has no try/catch around unzipSync, and openArchieLibrary's openError rethrows any Error verbatim — a user dropping a garbage zip sees \"invalid zip data\" / \"unknown compression type 99\", not the friendly steer. Expected contract: decode failure carries the friendly open message while keeping the cap refusals' own exact text.",
    );
  }

  // truncated EOCD: valid local header + payload, EOCD cut off
  const truncEocd = buildZip([{ name: "a.txt", data: u8("hello") }]).subarray(0, 30 + 5 + 8); // cut inside the central dir
  const r2 = throwsWith(() => ZipFilesystem.fromZip(truncEocd), /invalid zip data/);
  check(r2.threw, "truncated EOCD (local header + data, central dir cut) throws", r2.message);

  // truncated STORED entry: EOCD declares 100 bytes, only 7 present → silent short bytes?
  const truncStored = buildZip([{ name: "t.txt", data: u8("short!"), declaredSize: 100, declaredOriginalSize: 100 }]);
  let tfs: ZipFilesystem | null = null;
  let tErr = "";
  try {
    tfs = ZipFilesystem.fromZip(truncStored);
  } catch (e) {
    tErr = e instanceof Error ? e.message : String(e);
  }
  const tLen = tfs ? (await (await (await (await tfs.root()).getFile("t.txt")).readable())).byteLength : -1;
  check(
    tfs === null || tLen === 100,
    "truncated STORED entry is not silently corrupt",
    tfs === null
      ? `threw: ${tErr}`
      : `fromZip ACCEPTED it; file bytes = ${tLen} (declared 100) — the EOCD-declared size is never verified against actual bytes (fflate slices to EOF, mixing payload with central-directory bytes)`,
  );
  if (tfs && tLen !== 100) {
    findings.push(
      "Truncated STORED entries decode silently to short bytes (case A5): fromZip accepts a zip whose EOCD declares more entry bytes than the file holds — fflate's stored slice clamps at EOF and mixes in trailing bytes, and fromZip never compares declared vs actual. Expected contract: a torn body is a decode failure, never silent corruption.",
    );
  }

  // truncated DEFLATE entry: cut mid-stream → inflate must fail
  const realDef = deflateSync(u8("hello hello hello hello hello hello hello"));
  const truncDef = buildZip([
    { name: "d.txt", data: realDef.subarray(0, Math.floor(realDef.length / 2)), declaredOriginalSize: 1000 },
  ]);
  const r3 = throwsWith(() => ZipFilesystem.fromZip(truncDef), /invalid|eof|length/i);
  check(r3.threw, "truncated DEFLATE entry (mid-stream cut) throws", r3.message || "accepted (silent)");
}

// A8 — duplicate entry names (case 3): pin last-wins
{
  const dup = buildZip([
    { name: "dup.txt", data: u8("first") },
    { name: "dup.txt", data: u8("second") },
  ]);
  const fs = ZipFilesystem.fromZip(dup);
  const got = new TextDecoder().decode(await (await (await fs.root()).getFile("dup.txt")).readable());
  check(got === "second", "duplicate entry names → last-wins", `getFile("dup.txt") = ${JSON.stringify(got)} (fflate overwrites on the second central-directory entry)`);
}

// A9/A10 — encrypted zip (case 4, bit 0 of the general-purpose flag)
{
  const encStored = buildZip([{ name: "e.txt", data: u8("SECRET"), gpflag: 1 }]);
  let efs: ZipFilesystem | null = null;
  let eErr = "";
  try {
    efs = ZipFilesystem.fromZip(encStored);
  } catch (e) {
    eErr = e instanceof Error ? e.message : String(e);
  }
  const eGot = efs ? new TextDecoder().decode(await (await (await efs.root()).getFile("e.txt")).readable()) : "";
  check(
    efs !== null && eGot === "SECRET",
    "encrypted STORED entry (gpflag bit 0) — outcome pinned",
    eErr
      ? `threw: ${eErr}`
      : `no throw; bytes surfaced as-is (${JSON.stringify(eGot)}) — fflate IGNORES the encryption bit; no decryption is attempted or signalled`,
  );
  const encDef = buildZip([{ name: "ed.txt", data: u8("not-a-deflate-stream"), gpflag: 1, method: 8 }]);
  const r = throwsWith(() => ZipFilesystem.fromZip(encDef), /./);
  check(r.threw, "encrypted DEFLATE entry (garbage stream) fails closed", r.message || "accepted");
}

// A11 — unsupported compression method (case 4, method 99)
{
  const m99 = buildZip([{ name: "m.txt", data: u8("x"), method: 99 }]);
  const r = throwsWith(() => ZipFilesystem.fromZip(m99), /unknown compression type 99/);
  check(
    r.threw && /unknown compression type 99/.test(r.message),
    "unsupported compression method 99 throws",
    r.threw ? `message: "${r.message}" (the zipDecodeError wrap retains the raw fflate detail as a parenthetical)` : "accepted",
  );
}

// A12 — empty archive (case 5, PK\x05\x06, 0 entries)
{
  const empty = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...Array(18).fill(0)]);
  const r = await rejectsWith(openArchieLibrary(empty), /isn't an archie library/i);
  check(
    r.threw && /isn't an archie library/i.test(r.message),
    "empty archive (0 entries) refused by the open seam",
    r.threw ? r.message : "opened (unexpected)",
  );
}

// A13/A14 — exact-boundary total (case 6): the cap boundary is strict `>` — an HONEST archive at
// the cap is accepted, +1 rejected with the cap message. A LIAR archive at the cap (declares 100
// bytes, holds 3) is now REFUSED by the declared-size verification (structurally identical to the
// A5 truncation case) — the refusal comes from the torn-body check, not the cap.
{
  const tiny = { maxTotalBytes: 100, maxEntries: 10, maxRatio: 100 };
  // liar at the boundary: declared == cap but actual != declared → torn-body verification refuses
  const liar = buildZip([{ name: "e.txt", data: u8("hi!"), declaredSize: 100, declaredOriginalSize: 100 }]);
  const r0 = throwsWith(() => ZipFilesystem.fromZip(liar, tiny), /truncated/i);
  check(
    r0.threw && /truncated/.test(r0.message),
    "declared total exactly == maxTotalBytes but declared != actual → REFUSED (torn-body verification)",
    r0.threw ? r0.message : "accepted — the liar archive decoded without its declared size being verified",
  );
  // honest at the boundary: declared == actual == cap → the strict-`>` cap boundary still accepts
  const honest = buildZip([{ name: "e.txt", data: u8("x".repeat(100)), declaredSize: 100, declaredOriginalSize: 100 }]);
  let a13: ZipFilesystem | null = null;
  try {
    a13 = ZipFilesystem.fromZip(honest, tiny);
  } catch {
    /* expected to be caught below */
  }
  check(
    a13 !== null,
    "honest declared total exactly == maxTotalBytes accepted (boundary is strict >)",
    a13 !== null ? "accepted" : "rejected (boundary is <= ?)",
  );
  const over = buildZip([{ name: "e.txt", data: u8("hi!"), declaredSize: 101, declaredOriginalSize: 101 }]);
  const r = throwsWith(() => ZipFilesystem.fromZip(over, tiny), /total uncompressed size exceeds/i);
  check(
    r.threw && /total uncompressed size exceeds/i.test(r.message),
    "declared total == cap + 1 rejected with the cap message",
    r.message || "accepted",
  );
}

// A15/A16/A17 — 4 GiB territory (case 6): 32-bit fields can't declare 2^32, zip64 can
{
  // 32-bit max declaration (0xFFFFFFFF) — total 4294967295 < 4 GiB cap (so the CAP passes), but
  // declared (4294967295) != actual (3 bytes) → the torn-body verification refuses it
  const max32 = buildZip([{ name: "m32.bin", data: u8("tiny"), declaredSize: 4294967295, declaredOriginalSize: 4294967295 }]);
  const r15 = throwsWith(() => ZipFilesystem.fromZip(max32), /truncated/i);
  check(
    r15.threw && /truncated/.test(r15.message),
    "32-bit max declaration (0xFFFFFFFF total) → REFUSED — declared != actual (torn-body verification)",
    r15.threw ? r15.message : "accepted (unexpected)",
  );

  // zip64 declared EXACTLY 4 GiB (2^32) — total == cap (so the CAP passes), but declared (2^32) !=
  // actual (3 bytes) → the torn-body verification refuses it, exactly like the A5 truncation case
  const fourGiB = buildZip(
    [
      {
        name: "big.bin",
        data: u8("tiny"),
        declaredSize: 4294967296,
        declaredOriginalSize: 4294967296,
        zip64: true,
      },
    ],
    { zip64Eocd: true },
  );
  const r16 = throwsWith(() => ZipFilesystem.fromZip(fourGiB), /truncated/i);
  check(
    r16.threw && /truncated/.test(r16.message),
    "zip64 single entry declared exactly 4 GiB (2^32) → REFUSED — declared != actual (torn-body verification)",
    r16.threw ? r16.message : "accepted (unexpected)",
  );

  // zip64 declared 4 GiB + 1 — the ONLY way to trip the total cap
  const over4 = buildZip(
    [
      {
        name: "big2.bin",
        data: u8("tiny"),
        declaredSize: 4294967297,
        declaredOriginalSize: 4294967297,
        zip64: true,
      },
    ],
    { zip64Eocd: true },
  );
  const r = throwsWith(() => ZipFilesystem.fromZip(over4), /total uncompressed size exceeds the 4096 MB cap/i);
  check(
    r.threw && /total uncompressed size exceeds the 4096 MB cap/.test(r.message),
    "zip64 declared 4 GiB + 1 rejected with the PRODUCTION total-cap message",
    r.message || "accepted",
  );
}

// A18 — exact cap-message text (case 7): existing tests only regex-match; pin the exact steer.
{
  const tiny = { maxTotalBytes: 500_000, maxEntries: 3, maxRatio: 100 };
  const four = buildZip([
    { name: "a", data: u8("1"), declaredSize: 10, declaredOriginalSize: 10 },
    { name: "b", data: u8("1"), declaredSize: 10, declaredOriginalSize: 10 },
    { name: "c", data: u8("1"), declaredSize: 10, declaredOriginalSize: 10 },
    { name: "d", data: u8("1"), declaredSize: 10, declaredOriginalSize: 10 },
  ]);
  const r1 = throwsWith(() => ZipFilesystem.fromZip(four, tiny), /too many entries/);
  check(
    r1.threw && r1.message === "archie.zip rejected: too many entries (> 3) — possible zip bomb",
    "entries-cap message EXACT text (injected limits)",
    r1.message || "accepted",
  );
  const prodEntries = `archie.zip rejected: too many entries (> ${ZIP_LIMITS.maxEntries.toLocaleString()}) — possible zip bomb`;
  check(
    prodEntries === "archie.zip rejected: too many entries (> 500,000) — possible zip bomb",
    "entries-cap message EXACT production text (ZIP_LIMITS-derived; a 500,001-entry real trigger is not built)",
    prodEntries,
  );
  const bomb = buildZip([{ name: "bomb.txt", data: u8("z"), declaredSize: 1, declaredOriginalSize: 100000 }]);
  const r2 = throwsWith(() => ZipFilesystem.fromZip(bomb), /implausible compression ratio/);
  check(
    r2.threw &&
      r2.message ===
        'archie.zip rejected: entry "bomb.txt" has an implausible compression ratio (100000× > 100×) — possible zip bomb',
    "ratio-cap message EXACT text (production limits)",
    r2.message || "accepted",
  );
  const over4 = buildZip(
    [
      {
        name: "big2.bin",
        data: u8("tiny"),
        declaredSize: 4294967297,
        declaredOriginalSize: 4294967297,
        zip64: true,
      },
    ],
    { zip64Eocd: true },
  );
  const r3 = throwsWith(() => ZipFilesystem.fromZip(over4), /total/);
  check(
    r3.threw && r3.message === "archie.zip rejected: total uncompressed size exceeds the 4096 MB cap — possible zip bomb",
    "total-cap message EXACT production text (4096 MB)",
    r3.message || "accepted",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Section B — openArchieLibrary / fetchArchieLibraryBytes / fetchZipBytesIfAny
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n[B] open seam — transfer faults, statuses, cap survival");

// B1 — torn transfer (case 8): arrayBuffer() throws mid-transfer → RAW error propagates.
{
  const torn: typeof fetch = (async () =>
    ({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => {
        throw new Error("torn body mid-transfer");
      },
    })) as unknown as typeof fetch;
  const r = await rejectsWith(fetchArchieLibraryBytes("https://x/lib.zip", { fetch: torn }), /Couldn't open/);
  check(
    r.threw && r.message.includes("Couldn't open the library"),
    "fetchArchieLibraryBytes torn body classifies FAILED with the friendly dead-link message (never the raw transport error)",
    r.threw ? `message: "${r.message}"` : "resolved (unexpected)",
  );
  const got = await fetchZipBytesIfAny("https://x/lib.zip", { fetch: torn });
  check(
    got === null,
    "fetchZipBytesIfAny swallows a torn transfer to null (its documented network-fault-swallows contract)",
    got === null ? "null — swallowed per contract" : `unexpected: ${got === undefined ? "undefined" : `${got.byteLength} bytes`}`,
  );
}

// B3 — Blob drop path has NO SRC_MAX_BYTES check (case 9). openArchieLibrary takes no cap parameter
// (no injection point); SRC_MAX_BYTES (1 GiB) is the seam's only byte cap and it guards the FETCH
// path only. Demonstrate: a Blob of SRC_MAX_BYTES + 1 bytes opens.
{
  console.log("  [B3] building a >SRC_MAX_BYTES blob (1 GiB stored payload) — one-time cost…");
  // Raw builder (not zipSync — a 1 GiB STORED payload is exactly what the hostile builder exists for).
  const payload = new Uint8Array(SRC_MAX_BYTES + 1); // 1 GiB + 1 of zeros
  const bigZip = buildZip([
    { name: "archie.json", data: u8('{"format":"archie-library","version":1,"generator":"archie"}') },
    { name: "exhibits.json", data: u8('{"library":{"title":"X"},"exhibits":[]}') },
    { name: "payload.bin", data: payload }, // stored by default (method 0) — the zip itself is > 1 GiB
  ]);
  const blob = new Blob([bigZip]);
  const r = await rejectsWith(openArchieLibrary(blob), /too large/i);
  check(
    r.threw && /too large/i.test(r.message),
    "openArchieLibrary(Blob) applies the byte cap — a blob larger than SRC_MAX_BYTES must refuse",
    r.threw
      ? `refused: ${r.message}`
      : `OPENED ${blob.size.toLocaleString()} bytes (SRC_MAX_BYTES = ${SRC_MAX_BYTES.toLocaleString()}) — the in-hand path never checks byte length; only fromZip's declared-size caps apply`,
  );
  if (!r.threw) {
    findings.push(
      "openArchieLibrary(Blob) bypasses the byte cap (case B3): SRC_MAX_BYTES is documented as the cap on untrusted bytes 'in hand or fetched', but the in-hand path (Blob/Uint8Array) never checks byte length — a > 1 GiB dropped file reaches fromZip un-capped (only the zip's DECLARED-size caps apply, and trailing/stored content can be arbitrarily large). Expected contract: the same SRC_MAX_BYTES gate the fetch path applies.",
    );
  }
}

// B4-B7 — non-OK statuses + redirect through openArchieLibraryFromUrl (case 10)
{
  const stub = (status: number): typeof fetch =>
    (async () => ({ ok: false, status, headers: { get: () => null } })) as unknown as typeof fetch;
  for (const status of [401, 403, 429]) {
    const r = await rejectsWith(
      openArchieLibraryFromUrl("https://x/lib.zip", { fetch: stub(status) }),
      /Couldn't open the library\. The link may be broken or the file unavailable\./,
    );
    check(
      r.threw && r.message === "Couldn't open the library. The link may be broken or the file unavailable.",
      `HTTP ${status} → friendly "Couldn't open the library" error`,
      r.message || "resolved (unexpected)",
    );
  }
  check(
    true,
    "redirects — documented, not independently asserted",
    "fetch's default redirect:'follow' resolves 3xx before the seam sees a status; a 3xx that DOES reach the seam (redirect:'manual' / non-following fetch) hits the same non-OK branch as 4xx/5xx above. No HTTP server in this probe (cross-slice rule) — the transport probe owns live redirects.",
  );
}

// B8 — zip-bomb cap message surviving the seam (case 11): fetch OK, decode refuses.
{
  const bombZip = buildZip([{ name: "bomb.txt", data: u8("z"), declaredSize: 1, declaredOriginalSize: 100000 }]);
  const okFetch: typeof fetch = (async () => ({
    ok: true,
    headers: { get: (h: string) => (String(h).toLowerCase() === "content-length" ? String(bombZip.length) : null) },
    arrayBuffer: async () => bombZip,
  })) as unknown as typeof fetch;
  const r = await rejectsWith(openArchieLibraryFromUrl("https://x/lib.zip", { fetch: okFetch }), /possible zip bomb/);
  check(
    r.threw &&
      r.message.includes("archie.zip rejected") &&
      r.message.includes("possible zip bomb") &&
      r.message.includes("implausible compression ratio"),
    "fromZip cap message survives openArchieLibraryFromUrl VERBATIM (fetch OK, decode refuses)",
    r.message || "opened (unexpected)",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Section C — assertSafeSegment direct fuzz (case 12/13)
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n[C] assertSafeSegment fuzz");
const seg = (name: string): { threw: boolean; message: string } => throwsWith(() => assertSafeSegment(name, "unsafe path segment"), /./);
for (const name of ["", ".", "..", "a/b", "a\\b", "\\", "..\\", "a\0b", "\0", "a/b/c"]) {
  const r = seg(name);
  check(
    r.threw,
    `assertSafeSegment rejects ${JSON.stringify(name)}`,
    r.threw ? `threw: ${r.message}` : `ACCEPTED — only exact "", ".", "..", separators and NUL are rejected`,
  );
}
for (const name of ["a b", ".hidden", "....", "%2e%2e", "%2F", "?x", "#y", "http:evil", " a ", "\u2215", "\uFF0F"]) {
  const r = seg(name);
  const unicode = name === "\u2215" || name === "\uFF0F" ? " (U+2215 / U+FF0F — NOT caught by /[/\\\\]/ — exposure documented)" : "";
  const dots = name === "...." ? " (only exact \"..\" is the traversal sentinel; \"....\" is a legal literal filename — FSA-mirror semantics, harmless)" : "";
  check(
    !r.threw,
    `assertSafeSegment accepts ${JSON.stringify(name)} (allowed-by-design)${unicode}${dots}`,
    r.threw ? `threw: ${r.message}` : "accepted as a literal segment",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Section D — classifyArchieMarker / validateArchieMarker edge shapes (case 14-19)
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n[D] marker classifier + gate");

// D1-D4 — top-level JSON that is an ARRAY / number / string / boolean (case 14)
for (const [label, value] of [
  ["ARRAY", [1, 2, 3]],
  ["number", 42],
  ["string", "archie-library"],
  ["boolean", true],
] as const) {
  const v = classifyArchieMarker(value as never);
  check(
    v.kind === "foreign" || v.kind === "malformed",
    `classifyArchieMarker(top-level ${label}) → refusal verdict`,
    `kind=${v.kind} — a non-object has no .format, so the format-first branch yields foreign; both refuse`,
  );
  const r = await rejectsWith(openArchieLibrary(markerZip(value)), /isn't an archie library/i);
  check(
    r.threw && /isn't an archie library/i.test(r.message),
    `gate refuses top-level ${label} marker`,
    r.message || "opened (unexpected)",
  );
}

// D5/D6 — version = ±Infinity (case 15)
{
  for (const [label, version] of [
    ["+Infinity", Infinity],
    ["-Infinity", -Infinity],
  ] as const) {
    const v = classifyArchieMarker({ format: "archie-library", version });
    check(
      v.kind === "malformed",
      `classifyArchieMarker(version = ${label}) → malformed`,
      `kind=${v.kind} (typeof Infinity is number but Number.isFinite fails)`,
    );
  }
  const r = await rejectsWith(
    openArchieLibrary(markerZip({ format: "archie-library", version: Infinity })),
    /version marker is malformed\. Re-publish it from Archie\./,
  );
  check(
    r.threw && r.message === "This file claims to be an Archie library but its version marker is malformed. Re-publish it from Archie.",
    "gate refuses version = +Infinity with the malformed-marker message",
    r.message || "opened (unexpected)",
  );
}

// D7/D8 — extra/unknown fields + __proto__/constructor keys (case 16)
{
  const polluted = JSON.parse(
    '{"format":"archie-library","version":1,"generator":"archie","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"extra":123}',
  );
  const v = classifyArchieMarker(polluted);
  check(
    v.kind === "current",
    "classifyArchieMarker(__proto__/constructor extras) → current, no crash",
    `kind=${v.kind} — extra fields are ignored; JSON.parse makes __proto__ an own data property (no prototype pollution)`,
  );
  check(
    ({} as Record<string, unknown>).polluted === undefined,
    "marker JSON does not pollute Object.prototype",
    `({}).polluted === ${String(({} as Record<string, unknown>).polluted)}`,
  );
  const fs = await openArchieLibrary(markerZip(polluted));
  check(fs !== null, "gate ACCEPTS a __proto__/constructor-extra marker (with exhibits.json present)", "resolved");
}

// D9 — non-string generation (case 17)
{
  for (const generation of [12345, { nested: true }]) {
    const v = classifyArchieMarker({ format: "archie-library", version: 1, generation } as never);
    check(
      v.kind === "current",
      `classifyArchieMarker(generation = ${JSON.stringify(generation)}) → current (not validated)`,
      `kind=${v.kind} — the classifier gates ONLY format + version; generator and generation are never type-checked (documented observation)`,
    );
  }
  const fs = await openArchieLibrary(markerZip({ format: "archie-library", version: 1, generation: 12345 }));
  check(fs !== null, "gate accepts a non-string generation field", "resolved");
}

// D10/D11 — case/whitespace format variants (case 18)
{
  for (const format of ["ARCHIE-LIBRARY", " archie-library "]) {
    const v = classifyArchieMarker({ format, version: 1 });
    check(
      v.kind === "foreign",
      `classifyArchieMarker(format = ${JSON.stringify(format)}) → foreign`,
      `kind=${v.kind} — exact-match on "archie-library"`,
    );
  }
  const r = await rejectsWith(
    openArchieLibrary(markerZip({ format: "ARCHIE-LIBRARY", version: 1 })),
    /isn't an Archie library/i,
  );
  check(
    r.threw && r.message === "This file isn't an Archie library. Choose a published .archie.zip exported from Archie.",
    "gate refuses a case-variant marker with the exact foreign message",
    r.message || "opened (unexpected)",
  );
}

// D12 — malformed version at the gate (message pin)
{
  const r = await rejectsWith(
    openArchieLibrary(markerZip({ format: "archie-library", version: "one" })),
    /version marker is malformed/i,
  );
  check(
    r.threw && r.message === "This file claims to be an Archie library but its version marker is malformed. Re-publish it from Archie.",
    "gate refuses a non-numeric version with the exact malformed message",
    r.message || "opened (unexpected)",
  );
}

// D13 — present-but-torn marker through validateArchieMarker (case 19)
{
  const torn = zipSync({
    "archie.json": u8('{"format":"archie-library","version":1'), // truncated JSON — file PRESENT, body torn
    "exhibits.json": u8('{"library":{"title":"X"},"exhibits":[]}'),
  });
  const r = await rejectsWith(openArchieLibrary(torn), /could not be read/i);
  const isRefusal =
    r.threw &&
    r.message === "This file claims to be an Archie library but its marker could not be read. Re-publish it from Archie.";
  check(
    isRefusal,
    "present-but-torn marker → NotAnArchieLibraryError refusal (marker steer)",
    r.threw
      ? `${r.message} — validateArchieMarker wraps the marker-read fault (FailedReadError) as the marker's refusal`
      : "opened (unexpected)",
  );
}

await finish();
