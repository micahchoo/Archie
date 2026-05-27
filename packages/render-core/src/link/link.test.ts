import { describe, it, expect } from "vitest";
import { buildLinkIndex, resolveLink, validateLink, encodeLinkRef, parseLinkRef, rewriteArchieLinks, type LinkTarget } from "./link.js";
import { appendNew } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import type { AnnotationLog } from "../wadm/types.js";

// Linkability resolution (CONTEXT linkability v1, locked frame). Intra-Library: a structured
// ref resolves to a published display URL (auto-updating if the path changes) and is
// publish-time validatable. Cross-Library: reuse the Q8 deep-link (#/a/<id>) — no new system.

const alice = asClientId("alice");
const n1 = appendNew([], { target: "https://img/a.jpg", body: { type: "TextualBody", value: "n1" }, lastEditor: alice, modifiedAt: "t", now: 1 }).record;
const n2 = appendNew([], { target: { type: "SpecificResource", source: "https://img/b.jpg", selector: { type: "FragmentSelector", value: "xywh=pixel:1,2,3,4" } }, lastEditor: alice, modifiedAt: "t", now: 2 }).record;
const logs: Record<string, AnnotationLog> = { intro: [n1], main: [n2] };

describe("buildLinkIndex — Library-wide note index (a projection of the logs)", () => {
  it("maps each note's logicalId to its exhibit slug", () => {
    const idx = buildLinkIndex(logs);
    expect(idx.get(n1.logicalId)?.exhibitSlug).toBe("intro");
    expect(idx.get(n2.logicalId)?.exhibitSlug).toBe("main");
    expect(idx.size).toBe(2);
  });
});

describe("resolveLink — structured ref -> published display URL (pinned grammar /{slug}/#/a/{id})", () => {
  it("resolves a note link", () => {
    const target: LinkTarget = { exhibitSlug: "main", noteLogicalId: n2.logicalId };
    expect(resolveLink(target, { baseUrl: "https://u.gh.io/lib/" })).toBe(`https://u.gh.io/lib/main/#/a/${n2.logicalId}`);
  });
  it("resolves a region link (xywh) and an exhibit-root link", () => {
    expect(resolveLink({ exhibitSlug: "main", noteLogicalId: n2.logicalId, xywh: "1,2,3,4" }, { baseUrl: "b/" })).toBe(`b/main/#/a/${n2.logicalId}?xywh=1,2,3,4`);
    expect(resolveLink({ exhibitSlug: "main" }, { baseUrl: "b/" })).toBe("b/main/");
  });
});

describe("validateLink — publish-time target existence check", () => {
  it("passes for an existing note and fails for a missing one", () => {
    const idx = buildLinkIndex(logs);
    expect(validateLink({ exhibitSlug: "main", noteLogicalId: n2.logicalId }, idx)).toBe(true);
    expect(validateLink({ exhibitSlug: "main", noteLogicalId: n1.logicalId }, idx)).toBe(false); // n1 is in `intro`, not `main`
    expect(validateLink({ exhibitSlug: "ghost", noteLogicalId: n2.logicalId }, idx)).toBe(false);
  });
  it("an exhibit-root link is valid iff the exhibit has any notes in the index", () => {
    const idx = buildLinkIndex(logs);
    expect(validateLink({ exhibitSlug: "intro" }, idx)).toBe(true);
    expect(validateLink({ exhibitSlug: "ghost" }, idx)).toBe(false);
  });
});

describe("encodeLinkRef / parseLinkRef — the in-body `archie:` structured ref (round-trip)", () => {
  const cases: LinkTarget[] = [
    { exhibitSlug: "bidar", noteLogicalId: n2.logicalId },
    { exhibitSlug: "bidar", noteLogicalId: n2.logicalId, xywh: "1,2,3,4" },
    { exhibitSlug: "bidar", rangeId: "sec-3" },
    { exhibitSlug: "bidar" },
  ];
  it.each(cases)("round-trips %o", (target) => {
    const uri = encodeLinkRef(target);
    expect(uri.startsWith("archie:")).toBe(true);
    expect(parseLinkRef(uri)).toEqual(target);
  });
  it("uses the pinned grammar (scheme + deep-link fragment)", () => {
    expect(encodeLinkRef({ exhibitSlug: "bidar", noteLogicalId: n2.logicalId })).toBe(`archie:bidar/#/a/${n2.logicalId}`);
    expect(encodeLinkRef({ exhibitSlug: "bidar", rangeId: "sec-3" })).toBe("archie:bidar/#/s/sec-3");
    expect(encodeLinkRef({ exhibitSlug: "bidar" })).toBe("archie:bidar/");
  });
  it("rejects non-archie and malformed refs", () => {
    expect(parseLinkRef("https://x/y")).toBeNull();
    expect(parseLinkRef("archie:/#/a/x")).toBeNull(); // empty slug
    expect(parseLinkRef("archie:bidar/#/s/")).toBeNull(); // empty range
    expect(parseLinkRef("archie:bidar/#/weird/x")).toBeNull(); // unknown fragment
  });
});

describe("rewriteArchieLinks — heads-page projection: resolve valid refs, degrade broken ones", () => {
  const idx = buildLinkIndex(logs);
  const opts = {
    resolve: (t: LinkTarget) => resolveLink(t, { baseUrl: "https://u.gh.io/lib/" }),
    validate: (t: LinkTarget) => validateLink(t, idx),
  };

  it("rewrites a valid in-body ref to its published display URL", () => {
    const md = `See [the hands](${encodeLinkRef({ exhibitSlug: "main", noteLogicalId: n2.logicalId })}) closely.`;
    const { md: out, broken } = rewriteArchieLinks(md, opts);
    expect(out).toBe(`See [the hands](https://u.gh.io/lib/main/#/a/${n2.logicalId}) closely.`);
    expect(broken).toEqual([]);
  });

  it("degrades a broken ref to plain text and reports it", () => {
    const dead = encodeLinkRef({ exhibitSlug: "main", noteLogicalId: n1.logicalId }); // n1 lives in `intro`, not `main`
    const { md: out, broken } = rewriteArchieLinks(`A [dead link](${dead}) here.`, opts);
    expect(out).toBe("A dead link here.");
    expect(broken).toEqual([{ exhibitSlug: "main", noteLogicalId: n1.logicalId }]);
  });

  it("leaves ordinary markdown links and bodies untouched", () => {
    const md = "Plain [external](https://example.com) and **bold**, no archie refs.";
    expect(rewriteArchieLinks(md, opts)).toEqual({ md, broken: [] });
  });

  it("rewrites multiple refs in one body", () => {
    const a = encodeLinkRef({ exhibitSlug: "main", noteLogicalId: n2.logicalId });
    const b = encodeLinkRef({ exhibitSlug: "intro" });
    const { md: out, broken } = rewriteArchieLinks(`[one](${a}) then [two](${b})`, opts);
    expect(out).toBe(`[one](https://u.gh.io/lib/main/#/a/${n2.logicalId}) then [two](https://u.gh.io/lib/intro/)`);
    expect(broken).toEqual([]);
  });
});

describe("parseLinkRef — slug hardening (security S5)", () => {
  it("rejects an exhibit slug with markup / attribute-injection characters", () => {
    expect(parseLinkRef('archie:foo"onmouseover="alert(1)/')).toBeNull();
    expect(parseLinkRef("archie:a b/")).toBeNull();
    expect(parseLinkRef("archie:<svg>/")).toBeNull();
  });
  it("still accepts a normal slug", () => {
    expect(parseLinkRef("archie:bidar/")).toEqual({ exhibitSlug: "bidar" });
  });
});
