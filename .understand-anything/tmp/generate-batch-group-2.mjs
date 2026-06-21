import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const base = '/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/.understand-anything';
const tmpDir = join(base, 'tmp');
const outDir = join(base, 'intermediate');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const input = JSON.parse(readFileSync(join(tmpDir, 'analyzer-input-group-2.json'), 'utf8'));

// ── Inline extract data for all files ──
// Reconstructed from the pre-computed structural extraction results.
// Each entry: path -> { functions, classes, exports, sections, callGraph, metrics }

const EXTRACT_DATA = {
  // ── Batch 1 ──
  ".github/workflows/deploy.yml": {
    language: "yaml", fileCategory: "infra", totalLines: 45, nonEmptyLines: 45,
    sections: [
      { heading: "name", level: 1, line: 1 },
      { heading: "on", level: 1, line: 3 },
      { heading: "jobs", level: 1, line: 16 },
      { heading: "deploy", level: 2, line: 17 },
      { heading: "steps", level: 2, line: 22 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 5 }
  },

  // ── Batch 16: language-atlas/o4 ──
  "apps/viewer/public/published/language-atlas/canvas/o4/annotations-community.json": {
    language: "json", fileCategory: "config", totalLines: 37, nonEmptyLines: 37,
    sections: [
      { heading: "@context", level: 1, line: 2 },
      { heading: "id", level: 1, line: 3 },
      { heading: "type", level: 1, line: 4 },
      { heading: "items", level: 1, line: 5 },
      { heading: "partOf", level: 1, line: 31 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 5 }
  },
  "apps/viewer/public/published/language-atlas/canvas/o4/annotations-linguist.json": {
    language: "json", fileCategory: "config", totalLines: 37, nonEmptyLines: 37,
    sections: [
      { heading: "@context", level: 1, line: 2 },
      { heading: "id", level: 1, line: 3 },
      { heading: "type", level: 1, line: 4 },
      { heading: "items", level: 1, line: 5 },
      { heading: "partOf", level: 1, line: 31 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 5 }
  },
  "apps/viewer/public/published/language-atlas/canvas/o4/annotations.json": {
    language: "json", fileCategory: "config", totalLines: 30, nonEmptyLines: 30,
    sections: [
      { heading: "@context", level: 1, line: 2 },
      { heading: "id", level: 1, line: 3 },
      { heading: "type", level: 1, line: 4 },
      { heading: "partOf", level: 1, line: 24 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 4 }
  },

  // ── Batch 52: voynich/o3 ──
  "apps/viewer/public/published/voynich/canvas/o3/annotations-abjad.json": {
    language: "json", fileCategory: "config", totalLines: 37, nonEmptyLines: 37,
    sections: [
      { heading: "@context", level: 1, line: 2 },
      { heading: "id", level: 1, line: 3 },
      { heading: "type", level: 1, line: 4 },
      { heading: "items", level: 1, line: 5 },
      { heading: "partOf", level: 1, line: 31 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 5 }
  },
  "apps/viewer/public/published/voynich/canvas/o3/annotations-cipher.json": {
    language: "json", fileCategory: "config", totalLines: 47, nonEmptyLines: 47,
    sections: [
      { heading: "@context", level: 1, line: 2 },
      { heading: "id", level: 1, line: 3 },
      { heading: "type", level: 1, line: 4 },
      { heading: "items", level: 1, line: 5 },
      { heading: "partOf", level: 1, line: 41 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 5 }
  },
  "apps/viewer/public/published/voynich/canvas/o3/annotations-hoax.json": {
    language: "json", fileCategory: "config", totalLines: 37, nonEmptyLines: 37,
    sections: [
      { heading: "@context", level: 1, line: 2 },
      { heading: "id", level: 1, line: 3 },
      { heading: "type", level: 1, line: 4 },
      { heading: "items", level: 1, line: 5 },
      { heading: "partOf", level: 1, line: 31 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 5 }
  },
  "apps/viewer/public/published/voynich/canvas/o3/annotations.json": {
    language: "json", fileCategory: "config", totalLines: 30, nonEmptyLines: 30,
    sections: [
      { heading: "@context", level: 1, line: 2 },
      { heading: "id", level: 1, line: 3 },
      { heading: "type", level: 1, line: 4 },
      { heading: "partOf", level: 1, line: 24 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 4 }
  },

  // ── Batch 63: docs/architecture ──
  "docs/architecture/_meta.json": {
    language: "json", fileCategory: "config", totalLines: 45, nonEmptyLines: 45,
    sections: [
      { heading: "schema_version", level: 1, line: 2 }, { heading: "project_shape", level: 1, line: 3 },
      { heading: "analyzed_at", level: 1, line: 4 }, { heading: "git_sha", level: 1, line: 5 },
      { heading: "levels_completed", level: 1, line: 6 }, { heading: "levels_skipped", level: 1, line: 7 },
      { heading: "subsystems", level: 1, line: 8 }, { heading: "cross_cutting_lenses", level: 1, line: 16 },
      { heading: "staleness_hashes", level: 1, line: 24 }, { heading: "sources", level: 1, line: 34 },
      { heading: "confidence", level: 1, line: 43 }, { heading: "stale_since", level: 1, line: 44 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 12 }
  },
  "docs/architecture/domain.md": {
    language: "markdown", fileCategory: "docs", totalLines: 63, nonEmptyLines: 48,
    sections: [
      { heading: "Domain — Archie", level: 1, line: 1 }, { heading: "Business Problem", level: 2, line: 5 },
      { heading: "Core Concepts (Ubiquitous Language)", level: 2, line: 9 }, { heading: "Relationships", level: 2, line: 25 },
      { heading: "Locked Frames (Non-Negotiable)", level: 2, line: 34 },
      { heading: "Architectural Through-Line", level: 2, line: 45 }, { heading: "Layout Model", level: 2, line: 59 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 7 }
  },
  "docs/architecture/ecosystem.md": {
    language: "markdown", fileCategory: "docs", totalLines: 71, nonEmptyLines: 51,
    sections: [
      { heading: "Ecosystem — Archie", level: 1, line: 1 }, { heading: "Package Ecosystem", level: 2, line: 5 },
      { heading: "Runtime Dependencies", level: 3, line: 7 }, { heading: "Dev Dependencies", level: 3, line: 13 },
      { heading: "Build Tooling", level: 2, line: 20 }, { heading: "External Dependencies", level: 2, line: 32 },
      { heading: "IIIF / Standards", level: 3, line: 35 }, { heading: "Standards Compliance", level: 3, line: 37 },
      { heading: "Deployment Targets", level: 3, line: 46 }, { heading: "External Data Sources", level: 3, line: 53 },
      { heading: "Prior Art Survey", level: 2, line: 59 }, { heading: "Era Vintages", level: 2, line: 67 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 11 }
  },
  "docs/architecture/evolution.md": {
    language: "markdown", fileCategory: "docs", totalLines: 74, nonEmptyLines: 53,
    sections: [
      { heading: "Evolution — Archie", level: 1, line: 1 }, { heading: "Current State", level: 2, line: 5 },
      { heading: "Single-Era Architecture (Pre-1.0)", level: 3, line: 14 },
      { heading: "Why Single-Era", level: 2, line: 28 },
      { heading: "Pivot History", level: 2, line: 35 }, { heading: "Migration Path", level: 2, line: 48 },
      { heading: "Era Compatibility", level: 2, line: 69 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 11 }
  },
  "docs/architecture/features.json": {
    language: "json", fileCategory: "config", totalLines: 40, nonEmptyLines: 40,
    sections: [
      { heading: "root", level: 1, line: 2 }, { heading: "git_sha", level: 1, line: 3 },
      { heading: "analyzed_at", level: 1, line: 4 }, { heading: "features", level: 1, line: 5 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 4 }
  },
  "docs/architecture/infrastructure.md": {
    language: "markdown", fileCategory: "docs", totalLines: 86, nonEmptyLines: 68,
    sections: [
      { heading: "Infrastructure — Archie", level: 1, line: 1 }, { heading: "Repository", level: 2, line: 5 },
      { heading: "Language Breakdown", level: 2, line: 12 }, { heading: "Subsystems", level: 2, line: 47 },
      { heading: "The Through-Line", level: 2, line: 58 }, { heading: "Key Decisions", level: 2, line: 68 },
      { heading: "Current State", level: 2, line: 79 }, { heading: "Risk Concentration", level: 2, line: 86 },
      { heading: "See Also", level: 2, line: 85 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 9 }
  },
  "docs/architecture/overview.md": {
    language: "markdown", fileCategory: "docs", totalLines: 101, nonEmptyLines: 74,
    sections: [
      { heading: "Overview — Archie", level: 1, line: 1 }, { heading: "What Archie Is", level: 2, line: 5 },
      { heading: "Core Architecture", level: 2, line: 16 }, { heading: "Subsystems", level: 2, line: 26 },
      { heading: "Cross-Subsystem Flows", level: 2, line: 71 },
      { heading: "Key Design Decisions", level: 2, line: 78 }, { heading: "Current Limitations", level: 2, line: 89 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 9 }
  },
  "docs/architecture/risk-map.md": {
    language: "markdown", fileCategory: "docs", totalLines: 55, nonEmptyLines: 42,
    sections: [
      { heading: "Risk Map — Archie", level: 1, line: 1 }, { heading: "Risk Landscape", level: 2, line: 5 },
      { heading: "High Risk", level: 3, line: 8 }, { heading: "Medium Risk", level: 3, line: 18 },
      { heading: "Low Risk", level: 3, line: 28 }, { heading: "Mitigation Strategy", level: 2, line: 38 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 8 }
  },
  "docs/architecture/subsystems.md": {
    language: "markdown", fileCategory: "docs", totalLines: 99, nonEmptyLines: 71,
    sections: [
      { heading: "Subsystems — Archie", level: 1, line: 1 }, { heading: "1. Core Data", level: 2, line: 5 },
      { heading: "2. Rendering", level: 3, line: 35 },
      { heading: "3. Storage", level: 3, line: 49 }, { heading: "4. Publish", level: 3, line: 54 },
      { heading: "5. Studio", level: 3, line: 59 }, { heading: "6. Viewer", level: 3, line: 65 },
      { heading: "Cross-Subsystem Flows", level: 2, line: 71 }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0, sectionCount: 14 }
  },

  // ── Batch 68: studio/src code ──
  "apps/studio/src/exhibit-session.svelte.ts": {
    language: "typescript", fileCategory: "code", totalLines: 141, nonEmptyLines: 131,
    functions: [{ name: "createExhibitSession", startLine: 45, endLine: 140, params: ["deps"] }],
    exports: [{ name: "createExhibitSession", line: 45, isDefault: false }],
    callGraph: [
      { caller: "createExhibitSession", callee: "$state", lineNumber: 46 },
      { caller: "createExhibitSession", callee: "sess.save", lineNumber: 61 },
      { caller: "save", callee: "deps.autosaveToFolder", lineNumber: 64 },
      { caller: "scheduleSave", callee: "deps.touchBinding", lineNumber: 68 },
      { caller: "scheduleSave", callee: "clearTimeout", lineNumber: 70 },
      { caller: "scheduleSave", callee: "setTimeout", lineNumber: 71 },
      { caller: "open", callee: "freshSeed", lineNumber: 126 },
      { caller: "open", callee: "save", lineNumber: 137 }
    ],
    metrics: { importCount: 2, exportCount: 1, functionCount: 1, classCount: 0 }
  },
  "apps/studio/src/ExhibitOverview.svelte": {
    language: "svelte", fileCategory: "code", totalLines: 466, nonEmptyLines: 443,
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/folder-import.test.ts": {
    language: "typescript", fileCategory: "code", totalLines: 130, nonEmptyLines: 122,
    functions: [{ name: "f", startLine: 4, endLine: 4, params: ["relativePath", "type"] }],
    callGraph: [
      { caller: "f", callee: "relativePath.split(\"/\").pop", lineNumber: 4 },
      { caller: "f", callee: "relativePath.split", lineNumber: 4 }
    ],
    metrics: { importCount: 1, exportCount: 0, functionCount: 1, classCount: 0 }
  },
  "apps/studio/src/folder-import.ts": {
    language: "typescript", fileCategory: "code", totalLines: 103, nonEmptyLines: 94,
    functions: [
      { name: "inferredMime", startLine: 29, endLine: 31, params: ["f"] },
      { name: "isImportableMedia", startLine: 34, endLine: 36, params: ["f"] },
      { name: "isHiddenPath", startLine: 39, endLine: 43, params: ["relativePath"] },
      { name: "folderNameFrom", startLine: 48, endLine: 52, params: ["files"] },
      { name: "mediaFilesInOrder", startLine: 56, endLine: 60, params: ["files"] },
      { name: "planFolderImportGroups", startLine: 72, endLine: 103, params: ["files"] }
    ],
    exports: [
      { name: "inferredMime", line: 29, isDefault: false },
      { name: "isImportableMedia", line: 34, isDefault: false },
      { name: "isHiddenPath", line: 39, isDefault: false },
      { name: "folderNameFrom", line: 48, isDefault: false },
      { name: "mediaFilesInOrder", line: 56, isDefault: false },
      { name: "planFolderImportGroups", line: 72, isDefault: false }
    ],
    callGraph: [
      { caller: "inferredMime", callee: "f.type.startsWith", lineNumber: 30 },
      { caller: "isImportableMedia", callee: "f.type.startsWith", lineNumber: 35 },
      { caller: "isHiddenPath", callee: "relativePath.split", lineNumber: 40 },
      { caller: "folderNameFrom", callee: "first.replace", lineNumber: 50 },
      { caller: "folderNameFrom", callee: "root.trim", lineNumber: 51 },
      { caller: "mediaFilesInOrder", callee: "isHiddenPath", lineNumber: 58 },
      { caller: "mediaFilesInOrder", callee: "isImportableMedia", lineNumber: 58 },
      { caller: "mediaFilesInOrder", callee: "a.relativePath.localeCompare", lineNumber: 59 },
      { caller: "planFolderImportGroups", callee: "files.filter", lineNumber: 73 },
      { caller: "planFolderImportGroups", callee: "isHiddenPath", lineNumber: 73 },
      { caller: "planFolderImportGroups", callee: "isImportableMedia", lineNumber: 73 },
      { caller: "planFolderImportGroups", callee: "group.files.sort", lineNumber: 75 },
      { caller: "planFolderImportGroups", callee: "folderNameFrom", lineNumber: 78 }
    ],
    metrics: { importCount: 0, exportCount: 6, functionCount: 6, classCount: 0 }
  },
  "apps/studio/src/geo-notes.test.ts": {
    language: "typescript", fileCategory: "code", totalLines: 56, nonEmptyLines: 48,
    functions: [
      { name: "makeState", startLine: 6, endLine: 15, params: [] },
      { name: "asGeoNote", startLine: 17, endLine: 26, params: ["overrides"] }
    ],
    metrics: { importCount: 2, exportCount: 0, functionCount: 2, classCount: 0 }
  },
  "apps/studio/src/geo-notes.ts": {
    language: "typescript", fileCategory: "code", totalLines: 45, nonEmptyLines: 38,
    functions: [
      { name: "resolveGeo", startLine: 6, endLine: 15, params: ["src"] },
      { name: "saveGeoNote", startLine: 19, endLine: 28, params: ["note", "lib"] },
      { name: "deleteGeoNote", startLine: 32, endLine: 40, params: ["noteId", "lib"] }
    ],
    exports: [
      { name: "resolveGeo", line: 6, isDefault: false },
      { name: "saveGeoNote", line: 19, isDefault: false },
      { name: "deleteGeoNote", line: 32, isDefault: false }
    ],
    metrics: { importCount: 0, exportCount: 3, functionCount: 3, classCount: 0 }
  },
  "apps/studio/src/handles-db.ts": {
    language: "typescript", fileCategory: "code", totalLines: 74, nonEmptyLines: 63,
    functions: [
      { name: "hasIDB", startLine: 12, endLine: 12, params: [] },
      { name: "openDb", startLine: 14, endLine: 21, params: [] },
      { name: "upgradeDb", startLine: 23, endLine: 31, params: ["db"] },
      { name: "closeDb", startLine: 33, endLine: 37, params: [] },
      { name: "storeName", startLine: 39, endLine: 39, params: ["kind"] },
      { name: "putHandle", startLine: 41, endLine: 47, params: ["kind", "handle"] },
      { name: "getHandle", startLine: 49, endLine: 55, params: ["kind"] },
      { name: "removeHandle", startLine: 57, endLine: 63, params: ["kind"] }
    ],
    exports: [
      { name: "hasIDB", line: 12, isDefault: false },
      { name: "openDb", line: 14, isDefault: false },
      { name: "putHandle", line: 41, isDefault: false },
      { name: "getHandle", line: 49, isDefault: false },
      { name: "removeHandle", line: 57, isDefault: false }
    ],
    callGraph: [
      { caller: "openDb", callee: "indexedDB.open", lineNumber: 15 },
      { caller: "putHandle", callee: "openDb", lineNumber: 42 },
      { caller: "putHandle", callee: "storeName", lineNumber: 44 },
      { caller: "getHandle", callee: "openDb", lineNumber: 50 },
      { caller: "getHandle", callee: "storeName", lineNumber: 52 },
      { caller: "removeHandle", callee: "openDb", lineNumber: 58 },
      { caller: "removeHandle", callee: "storeName", lineNumber: 60 }
    ],
    metrics: { importCount: 0, exportCount: 5, functionCount: 8, classCount: 0 }
  },
  "apps/studio/src/IdentityPrompt.svelte": {
    language: "svelte", fileCategory: "code", totalLines: 71, nonEmptyLines: 61,
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/iiif-import.test.ts": {
    language: "typescript", fileCategory: "code", totalLines: 117, nonEmptyLines: 105,
    metrics: { importCount: 1, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/iiif-import.ts": {
    language: "typescript", fileCategory: "code", totalLines: 125, nonEmptyLines: 112,
    functions: [
      { name: "iiifInfoUrl", startLine: 7, endLine: 9, params: ["src"] },
      { name: "fetchManifest", startLine: 13, endLine: 22, params: ["src"] },
      { name: "mediaTypeFromSource", startLine: 26, endLine: 32, params: ["src"] },
      { name: "extractObjects", startLine: 36, endLine: 55, params: ["manifest"] },
      { name: "planIIIFImportGroups", startLine: 59, endLine: 70, params: ["manifest"] },
      { name: "importManifest", startLine: 74, endLine: 97, params: ["src", "lib"] },
      { name: "importFromURL", startLine: 101, endLine: 112, params: ["url", "lib"] },
      { name: "importFromFile", startLine: 116, endLine: 121, params: ["file", "lib"] }
    ],
    classes: [
      { name: "IIIFManifestError", startLine: 123, endLine: 125, methods: [{ name: "constructor" }] }
    ],
    exports: [
      { name: "importManifest", line: 74, isDefault: false },
      { name: "importFromURL", line: 101, isDefault: false },
      { name: "IIIFManifestError", line: 123, isDefault: false }
    ],
    callGraph: [
      { caller: "iiifInfoUrl", callee: "src.replace", lineNumber: 8 },
      { caller: "fetchManifest", callee: "iiifInfoUrl", lineNumber: 14 },
      { caller: "fetchManifest", callee: "fetch", lineNumber: 16 },
      { caller: "mediaTypeFromSource", callee: "src.includes", lineNumber: 27 },
      { caller: "extractObjects", callee: "manifest.sequences", lineNumber: 38 },
      { caller: "extractObjects", callee: "canvas.images", lineNumber: 41 },
      { caller: "planIIIFImportGroups", callee: "extractObjects", lineNumber: 61 },
      { caller: "planIIIFImportGroups", callee: "groups.map", lineNumber: 62 },
      { caller: "importManifest", callee: "fetchManifest", lineNumber: 76 },
      { caller: "importManifest", callee: "planIIIFImportGroups", lineNumber: 80 },
      { caller: "importManifest", callee: "lib.addExhibit", lineNumber: 82 },
      { caller: "importFromURL", callee: "fetchManifest", lineNumber: 103 },
      { caller: "importFromFile", callee: "JSON.parse", lineNumber: 117 },
      { caller: "importFromFile", callee: "importManifest", lineNumber: 119 }
    ],
    metrics: { importCount: 0, exportCount: 3, functionCount: 9, classCount: 1 }
  },
  "apps/studio/src/ingest-flows.ts": {
    language: "typescript", fileCategory: "code", totalLines: 465, nonEmptyLines: 440,
    functions: [
      { name: "createIngestFlows", startLine: 78, endLine: 463, params: ["ctx"] }
    ],
    exports: [
      { name: "createIngestFlows", line: 78, isDefault: false },
      { name: "Library", line: 465, isDefault: false }
    ],
    callGraph: [
      { caller: "imageDims", callee: "resolve", lineNumber: 82 },
      { caller: "nextObjectId", callee: "ex.objects.map", lineNumber: 86 },
      { caller: "nextObjectId", callee: "existing.has", lineNumber: 87 },
      { caller: "exhibit", callee: "ctx.lib.meta.exhibits.find", lineNumber: 91 },
      { caller: "exhibit", callee: "ctx.currentSlug", lineNumber: 92 },
      { caller: "appendObject", callee: "ctx.setAssetUrl", lineNumber: 106 },
      { caller: "appendObject", callee: "ctx.lib.appendObject", lineNumber: 107 },
      { caller: "appendObject", callee: "ctx.currentSlug", lineNumber: 108 },
      { caller: "appendObject", callee: "ctx.setCurrentObjectId", lineNumber: 109 },
      { caller: "appendObject", callee: "ctx.clearAddForm", lineNumber: 110 },
      { caller: "appendObject", callee: "ctx.setAddingObject", lineNumber: 111 },
      { caller: "addObject", callee: "source.trim", lineNumber: 115 },
      { caller: "addObject", callee: "exhibit", lineNumber: 116 },
      { caller: "addObject", callee: "nextObjectId", lineNumber: 117 },
      { caller: "addObject", callee: "mediaTypeFromSource", lineNumber: 118 },
      { caller: "addObject", callee: "imageDims", lineNumber: 119 },
      { caller: "addObject", callee: "appendObject", lineNumber: 125 },
      { caller: "addObject", callee: "label.trim", lineNumber: 127 },
      { caller: "addMapObject", callee: "exhibit", lineNumber: 136 },
      { caller: "addMapObject", callee: "nextObjectId", lineNumber: 138 },
      { caller: "addMapObject", callee: "appendObject", lineNumber: 142 },
      { caller: "addObjectFromFile", callee: "ctx.setMapModalOpen", lineNumber: 152 },
      { caller: "addObjectFromFile", callee: "ctx.switchObject", lineNumber: 153 },
      { caller: "addObjectFromFile", callee: "ctx.toEditor", lineNumber: 154 },
      { caller: "addObjectFromFile", callee: "ctx.storeReady", lineNumber: 157 },
      { caller: "addObjectFromFile", callee: "file.name.replace", lineNumber: 160 },
      { caller: "addObjectFromFile", callee: "file.type.startsWith", lineNumber: 163 },
      { caller: "addObjectFromFile", callee: "saveAssetFile", lineNumber: 166 },
      { caller: "addObjectFromFile", callee: "URL.createObjectURL", lineNumber: 169 },
      { caller: "addObjectFromFile", callee: "Math.round", lineNumber: 175 },
      { caller: "addObjectFromFile", callee: "readExifOrientation", lineNumber: 180 },
      { caller: "addObjectFromFile", callee: "file.arrayBuffer", lineNumber: 182 },
      { caller: "addObjectFromFile", callee: "isOrientationNoop", lineNumber: 183 },
      { caller: "addObjectFromFile", callee: "bakeDisplayMaster", lineNumber: 186 },
      { caller: "addFiles", callee: "ctx.setImportBusy", lineNumber: 230 },
      { caller: "addFiles", callee: "saveAssetFile", lineNumber: 233 },
      { caller: "addFiles", callee: "URL.createObjectURL", lineNumber: 239 },
      { caller: "addFiles", callee: "Math.round", lineNumber: 245 },
      { caller: "addFiles", callee: "file.arrayBuffer", lineNumber: 248 },
      { caller: "addFiles", callee: "readExifOrientation", lineNumber: 249 },
      { caller: "addFiles", callee: "isOrientationNoop", lineNumber: 251 },
      { caller: "addFiles", callee: "bakeDisplayMaster", lineNumber: 255 },
      { caller: "addFiles", callee: "appendObject", lineNumber: 261 },
      { caller: "newExhibitFromFolder", callee: "ctx.lib.showCreateExhibitDialog", lineNumber: 275 },
      { caller: "newExhibitFromFolder", callee: "ctx.setImportBusy", lineNumber: 282 },
      { caller: "newExhibitFromFolder", callee: "saveAssetFile", lineNumber: 286 },
      { caller: "newExhibitFromFolder", callee: "appendObject", lineNumber: 297 },
      { caller: "newExhibitFromManifest", callee: "ctx.lib.showCreateExhibitDialog", lineNumber: 310 },
      { caller: "newExhibitFromManifest", callee: "planIIIFImportGroups", lineNumber: 316 },
      { caller: "newExhibitFromManifest", callee: "appendObject", lineNumber: 341 },
      { caller: "importNotesCsv", callee: "ctx.lib.annotationStore.importCsv", lineNumber: 354 },
      { caller: "importNotesCsv", callee: "ctx.lib.annotationStore.importWadm", lineNumber: 355 },
      { caller: "keyFor", callee: "h[0].toLowerCase", lineNumber: 360 },
      { caller: "commentValue", callee: "row[keyFor", lineNumber: 362 },
      { caller: "importNotesWadm", callee: "ctx.lib.annotationStore.importWadm", lineNumber: 378 },
      { caller: "replaceProjectFrom", callee: "ctx.lib.showReplaceProjectDialog", lineNumber: 390 },
      { caller: "openZip", callee: "ctx.lib.showOpenZipDialog", lineNumber: 402 }
    ],
    metrics: { importCount: 9, exportCount: 2, functionCount: 1, classCount: 0 }
  },
  "apps/studio/src/library-meta-reducers.test.ts": {
    language: "typescript", fileCategory: "code", totalLines: 78, nonEmptyLines: 68,
    functions: [{ name: "makeLib", startLine: 4, endLine: 12, params: [] }],
    metrics: { importCount: 2, exportCount: 0, functionCount: 1, classCount: 0 }
  },
  "apps/studio/src/library-meta-reducers.ts": {
    language: "typescript", fileCategory: "code", totalLines: 52, nonEmptyLines: 45,
    functions: [
      { name: "addExhibitIn", startLine: 4, endLine: 8, params: ["exhibits", "ex"] },
      { name: "patchExhibitIn", startLine: 12, endLine: 18, params: ["exhibits", "slug", "patch"] },
      { name: "removeExhibitIn", startLine: 22, endLine: 24, params: ["exhibits", "slug"] },
      { name: "appendObjectIn", startLine: 28, endLine: 33, params: ["exhibits", "slug", "obj"] },
      { name: "patchObjectIn", startLine: 37, endLine: 48, params: ["exhibits", "slug", "objectId", "patch"] },
      { name: "removeObjectIn", startLine: 50, endLine: 52, params: ["exhibits", "slug", "objectId"] }
    ],
    exports: [
      { name: "addExhibitIn", line: 4, isDefault: false },
      { name: "patchExhibitIn", line: 12, isDefault: false },
      { name: "removeExhibitIn", line: 22, isDefault: false },
      { name: "appendObjectIn", line: 28, isDefault: false },
      { name: "patchObjectIn", line: 37, isDefault: false },
      { name: "removeObjectIn", line: 50, isDefault: false },
      { name: "patchLibraryIn", line: 1, isDefault: false }
    ],
    callGraph: [
      { caller: "appendObjectIn", callee: "ex.objects.push", lineNumber: 30 },
      { caller: "patchObjectIn", callee: "ex.objects.findIndex", lineNumber: 40 },
      { caller: "patchObjectIn", callee: "Object.assign", lineNumber: 44 },
      { caller: "removeObjectIn", callee: "ex.objects.findIndex", lineNumber: 50 },
      { caller: "removeObjectIn", callee: "ex.objects.splice", lineNumber: 51 }
    ],
    metrics: { importCount: 1, exportCount: 7, functionCount: 7, classCount: 0 }
  },
  "apps/studio/src/library-meta.svelte.test.ts": {
    language: "typescript", fileCategory: "code", totalLines: 77, nonEmptyLines: 68,
    functions: [
      { name: "makeState", startLine: 4, endLine: 10, params: [] },
      { name: "emptyExhibit", startLine: 12, endLine: 12, params: [] },
      { name: "withObjects", startLine: 14, endLine: 24, params: ["objects"] }
    ],
    metrics: { importCount: 0, exportCount: 0, functionCount: 3, classCount: 0 }
  },
  "apps/studio/src/library-meta.svelte.ts": {
    language: "typescript", fileCategory: "code", totalLines: 67, nonEmptyLines: 58,
    functions: [
      { name: "libraryMeta", startLine: 14, endLine: 37, params: ["lib"] },
      { name: "enqueueSave", startLine: 40, endLine: 57, params: ["lib"] }
    ],
    exports: [{ name: "libraryMeta", line: 14, isDefault: false }],
    callGraph: [
      { caller: "libraryMeta", callee: "$state", lineNumber: 16 },
      { caller: "libraryMeta", callee: "lib.meta.exhibits.map", lineNumber: 19 },
      { caller: "libraryMeta", callee: "lib.meta.exhibits.findIndex", lineNumber: 20 },
      { caller: "libraryMeta", callee: "$derived", lineNumber: 25 },
      { caller: "enqueueSave", callee: "$effect", lineNumber: 42 },
      { caller: "enqueueSave", callee: "lib.save", lineNumber: 44 }
    ],
    metrics: { importCount: 3, exportCount: 1, functionCount: 2, classCount: 0 }
  },
  "apps/studio/src/LibraryHome.svelte": {
    language: "svelte", fileCategory: "code", totalLines: 381, nonEmptyLines: 352,
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/main.ts": {
    language: "typescript", fileCategory: "code", totalLines: 13, nonEmptyLines: 12,
    metrics: { importCount: 4, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/MediaPicker.svelte": {
    language: "svelte", fileCategory: "code", totalLines: 110, nonEmptyLines: 98,
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/MergeReview.svelte": {
    language: "svelte", fileCategory: "code", totalLines: 97, nonEmptyLines: 82,
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/narrative-cue-reducer.test.ts": {
    language: "typescript", fileCategory: "code", totalLines: 43, nonEmptyLines: 38,
    metrics: { importCount: 1, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/narrative-cue-reducer.ts": {
    language: "typescript", fileCategory: "code", totalLines: 34, nonEmptyLines: 30,
    functions: [{ name: "narrativeCueReducer", startLine: 25, endLine: 34, params: ["prev", "next", "seen"] }],
    exports: [{ name: "narrativeCueReducer", line: 25, isDefault: false }],
    metrics: { importCount: 0, exportCount: 1, functionCount: 1, classCount: 0 }
  },
  "apps/studio/src/NarrativeEditor.svelte": {
    language: "svelte", fileCategory: "code", totalLines: 276, nonEmptyLines: 248,
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/NoteEditor.svelte": {
    language: "svelte", fileCategory: "code", totalLines: 138, nonEmptyLines: 125,
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/PropsDrawer.svelte": {
    language: "svelte", fileCategory: "code", totalLines: 45, nonEmptyLines: 40,
    metrics: { importCount: 0, exportCount: 0, functionCount: 0, classCount: 0 }
  },
  "apps/studio/src/publish-flows.svelte.ts": {
    language: "typescript", fileCategory: "code", totalLines: 172, nonEmptyLines: 159,
    functions: [
      { name: "createPublishFlows", startLine: 12, endLine: 171, params: ["deps"] }
    ],
    exports: [{ name: "createPublishFlows", line: 12, isDefault: false }],
    callGraph: [
      { caller: "createPublishFlows", callee: "$state", lineNumber: 15 },
      { caller: "createPublishFlows", callee: "deps.persistPublishedLibrary", lineNumber: 20 },
      { caller: "createPublishFlows", callee: "deps.bakeThumbnails", lineNumber: 25 },
      { caller: "createPublishFlows", callee: "deps.bakeTileSource", lineNumber: 30 },
      { caller: "createPublishFlows", callee: "deps.persistProjectAssets", lineNumber: 37 },
      { caller: "createPublishFlows", callee: "deps.stampPublishedIdentity", lineNumber: 42 },
      { caller: "createPublishFlows", callee: "deps.cleanPublishedMedia", lineNumber: 49 },
      { caller: "publish", callee: "persistLibrary", lineNumber: 52 },
      { caller: "publish", callee: "persistBaked", lineNumber: 53 },
      { caller: "publish", callee: "persistAssets", lineNumber: 54 },
      { caller: "publish", callee: "stampIdentity", lineNumber: 55 },
      { caller: "publish", callee: "cleanMedia", lineNumber: 56 },
      { caller: "publish", callee: "setTimeout", lineNumber: 57 },
      { caller: "createPublishFlows", callee: "$derived", lineNumber: 65 },
      { caller: "createPublishFlows", callee: "deps.persistPublishedLibraryToZip", lineNumber: 80 },
      { caller: "createPublishFlows", callee: "deps.persistPublishedLibraryToGHPages", lineNumber: 93 },
      { caller: "publishToZip", callee: "setTimeout", lineNumber: 96 },
      { caller: "publishToGHPages", callee: "setTimeout", lineNumber: 108 }
    ],
    metrics: { importCount: 3, exportCount: 1, functionCount: 1, classCount: 0 }
  }
};

// ── Utility ──
function fileName(fp) { return fp.split('/').pop(); }
function dirPath(fp) { const p = fp.split('/'); p.pop(); return p.join('/'); }
function ancestors(fp) {
  const parts = fp.split('/'); parts.pop();
  const dirs = [];
  for (let i = 1; i <= parts.length; i++) dirs.push(parts.slice(0, i).join('/'));
  return dirs;
}

// ── Generation ──
function processBatch(batch, partFilePaths) {
  const bi = batch.batchIndex;
  const files = partFilePaths || batch.files;
  const filePathSet = new Set(files.map(f => typeof f === 'string' ? f : f.path));

  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  let eid = 0;
  function eId() { return `e${bi}_${eid++}`; }
  function addNode(n) { if (!nodeIds.has(n.id)) { nodeIds.add(n.id); nodes.push(n); } }
  function addEdge(s, t, type, label, meta = {}) {
    if (s && t) edges.push({ id: eId(), source: s, target: t, type, label: label || type, metadata: meta });
  }

  // Directory nodes
  const dirs = new Set();
  for (const fp of filePathSet) {
    for (const d of ancestors(fp)) dirs.add(d);
  }
  for (const d of dirs) {
    const parts = d.split('/');
    addNode({ id: d, type: 'directory', label: parts[parts.length - 1], filePath: d, language: null, fileCategory: 'directory', sizeLines: 0, metadata: {} });
  }
  for (const d of dirs) {
    if (d.includes('/')) {
      const parent = d.substring(0, d.lastIndexOf('/'));
      if (dirs.has(parent)) addEdge(parent, d, 'contains', 'contains');
    }
  }

  // File nodes + entities
  for (const item of files) {
    const fp = typeof item === 'string' ? item : item.path;
    const fileObj = typeof item === 'string' ? batch.files.find(f => f.path === fp) : item;
    const ext = EXTRACT_DATA[fp] || {};

    addNode({
      id: fp, type: 'file', label: fileName(fp),
      filePath: fp, language: fileObj.language, fileCategory: fileObj.fileCategory,
      sizeLines: fileObj.sizeLines, metadata: { metrics: ext.metrics || {} }
    });
    if (dirs.has(dirPath(fp))) addEdge(dirPath(fp), fp, 'contains', 'contains');

    const funcs = ext.functions || [];
    const classes = ext.classes || [];
    const exports = ext.exports || [];
    const exportedNames = new Set(exports.map(e => e.name));

    // Function nodes
    for (const fn of funcs) {
      const lines = fn.endLine - fn.startLine + 1;
      if (lines >= 10 || exportedNames.has(fn.name)) {
        const id = `${fp}:${fn.name}`;
        addNode({
          id, type: 'function', label: fn.name, filePath: fp,
          language: fileObj.language, fileCategory: 'code', sizeLines: lines,
          metadata: { metrics: {}, params: fn.params || [], startLine: fn.startLine, endLine: fn.endLine }
        });
        addEdge(fp, id, 'contains', `${fileName(fp)} contains ${fn.name}`);
      }
    }

    // Class nodes
    for (const cls of classes) {
      const lines = cls.endLine - cls.startLine + 1;
      const nMethods = (cls.methods || []).length;
      if (nMethods >= 2 || lines >= 20 || exportedNames.has(cls.name)) {
        const id = `${fp}:${cls.name}`;
        addNode({
          id, type: 'class', label: cls.name, filePath: fp,
          language: fileObj.language, fileCategory: 'code', sizeLines: lines,
          metadata: { metrics: {}, methods: (cls.methods || []).map(m => m.name), startLine: cls.startLine, endLine: cls.endLine }
        });
        addEdge(fp, id, 'contains', `${fileName(fp)} contains ${cls.name}`);
      }
    }

    // Export edges
    for (const exp of exports) {
      const fnId = `${fp}:${exp.name}`;
      const clsId = `${fp}:${exp.name}`;
      const targetId = nodeIds.has(fnId) ? fnId : (nodeIds.has(clsId) ? clsId : null);
      if (targetId) {
        addEdge(fp, targetId, 'export', `exports ${exp.name}`, { isDefault: exp.isDefault, line: exp.line });
      } else {
        addEdge(fp, fp, 'export', `exports ${exp.name}`, { isDefault: exp.isDefault, line: exp.line, inline: true });
      }
    }

    // Import edges from batchImportData
    const batchImports = batch.batchImportData[fp] || [];
    for (const imp of batchImports) {
      if (imp.source) addEdge(fp, imp.source, 'imports', `imports from ${imp.source}`, { names: imp.names || [] });
    }
  }

  // Call graph edges
  for (const item of files) {
    const fp = typeof item === 'string' ? item : item.path;
    const ext = EXTRACT_DATA[fp] || {};
    const callGraph = ext.callGraph || [];
    const seen = new Set();
    for (const cg of callGraph) {
      const key = `${cg.caller}|||${cg.callee}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const callerNodeId = `${fp}:${cg.caller}`;
      const calleeNodeId = `${fp}:${cg.callee}`;

      if (nodeIds.has(callerNodeId)) {
        if (nodeIds.has(calleeNodeId)) {
          addEdge(callerNodeId, calleeNodeId, 'calls', `${cg.caller} calls ${cg.callee}`);
        } else {
          addEdge(callerNodeId, fp, 'calls', `${cg.caller} calls ${cg.callee}`, { callee: cg.callee, external: true, line: cg.lineNumber });
        }
      } else {
        if (nodeIds.has(calleeNodeId)) {
          addEdge(fp, calleeNodeId, 'calls', `${cg.caller} calls ${cg.callee}`, { caller: cg.caller, internal: true, line: cg.lineNumber });
        } else {
          addEdge(fp, fp, 'calls', `${cg.caller} calls ${cg.callee}`, { caller: cg.caller, callee: cg.callee, internal: true, line: cg.lineNumber });
        }
      }
    }
  }

  // tested_by / tests
  for (const item of files) {
    const fp = typeof item === 'string' ? item : item.path;
    if (fp.includes('.test.')) {
      const src = fp.replace('.test.ts', '.ts').replace('.svelte.test.ts', '.svelte.ts');
      if (filePathSet.has(src)) {
        addEdge(fp, src, 'tests', 'tests');
        addEdge(src, fp, 'tested_by', 'tested by');
      }
    }
  }

  // Config files: configures edges
  for (const item of files) {
    const fp = typeof item === 'string' ? item : item.path;
    const fileObj = typeof item === 'string' ? batch.files.find(f => f.path === fp) : item;
    if (fileObj.fileCategory === 'config' && fp.includes('/published/')) {
      const d = dirPath(fp);
      if (dirs.has(d)) addEdge(fp, d, 'configures', 'configures');
    }
  }

  // Section nodes for docs/config/infra
  for (const item of files) {
    const fp = typeof item === 'string' ? item : item.path;
    const fileObj = typeof item === 'string' ? batch.files.find(f => f.path === fp) : item;
    const ext = EXTRACT_DATA[fp] || {};
    if ((fileObj.fileCategory === 'config' || fileObj.fileCategory === 'infra' || fileObj.fileCategory === 'docs') && ext.sections) {
      for (const sec of ext.sections) {
        if (sec.heading && sec.heading.trim()) {
          const slug = sec.heading.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
          const secId = `${fp}_section-${slug}`;
          addNode({
            id: secId, type: 'section', label: sec.heading, filePath: fp,
            language: fileObj.language, fileCategory: fileObj.fileCategory, sizeLines: 0,
            metadata: { metrics: {}, level: sec.level, line: sec.line }
          });
          addEdge(fp, secId, 'documents', 'documents', { section: sec.heading });
        }
      }
    }
  }

  // Cross-reference docs to overview
  const archFiles = [...filePathSet].filter(p => p.startsWith('docs/architecture/') && p.endsWith('.md') && p !== 'docs/architecture/overview.md');
  if (archFiles.length > 1 && filePathSet.has('docs/architecture/overview.md')) {
    for (const af of archFiles) {
      addEdge('docs/architecture/overview.md', af, 'related', `overview references ${fileName(af).replace('.md', '')}`);
    }
  }

  return { nodes, edges, batchIndex: bi };
}

// ── Main ──
const results = [];

for (const batch of input.batches) {
  const bi = batch.batchIndex;

  if (bi === 68) {
    const partitions = [
      ['apps/studio/src/ingest-flows.ts'],
      ['apps/studio/src/folder-import.ts', 'apps/studio/src/publish-flows.svelte.ts'],
      ['apps/studio/src/iiif-import.ts', 'apps/studio/src/handles-db.ts', 'apps/studio/src/library-meta.svelte.ts'],
      [
        'apps/studio/src/exhibit-session.svelte.ts', 'apps/studio/src/library-meta-reducers.ts',
        'apps/studio/src/geo-notes.ts', 'apps/studio/src/folder-import.test.ts',
        'apps/studio/src/library-meta.svelte.test.ts', 'apps/studio/src/geo-notes.test.ts',
        'apps/studio/src/iiif-import.test.ts', 'apps/studio/src/library-meta-reducers.test.ts',
        'apps/studio/src/narrative-cue-reducer.test.ts', 'apps/studio/src/narrative-cue-reducer.ts',
        'apps/studio/src/ExhibitOverview.svelte', 'apps/studio/src/IdentityPrompt.svelte',
        'apps/studio/src/LibraryHome.svelte', 'apps/studio/src/main.ts',
        'apps/studio/src/MediaPicker.svelte', 'apps/studio/src/MergeReview.svelte',
        'apps/studio/src/NarrativeEditor.svelte', 'apps/studio/src/NoteEditor.svelte',
        'apps/studio/src/PropsDrawer.svelte'
      ]
    ];

    for (let pi = 0; pi < partitions.length; pi++) {
      const result = processBatch(batch, partitions[pi]);
      const reEdges = result.edges.map((e, i) => ({ ...e, id: `e68p${pi + 1}_${i}` }));
      const output = {
        batchIndex: 68,
        partIndex: pi + 1,
        nodes: result.nodes,
        edges: reEdges,
        stats: { nodeCount: result.nodes.length, edgeCount: reEdges.length, fileCount: partitions[pi].length, totalParts: partitions.length }
      };
      const outPath = join(outDir, `batch-68-part-${pi + 1}.json`);
      writeFileSync(outPath, JSON.stringify(output, null, 2));
      results.push({ path: outPath, nodes: result.nodes.length, edges: reEdges.length, batchIndex: 68, part: pi + 1 });
    }
  } else {
    const result = processBatch(batch);
    const output = {
      batchIndex: bi,
      nodes: result.nodes,
      edges: result.edges,
      stats: { nodeCount: result.nodes.length, edgeCount: result.edges.length, fileCount: batch.files.length }
    };
    const outPath = join(outDir, `batch-${bi}.json`);
    writeFileSync(outPath, JSON.stringify(output, null, 2));
    results.push({ path: outPath, nodes: result.nodes.length, edges: result.edges.length, batchIndex: bi });
  }
}

// Summary
let totalN = 0, totalE = 0;
for (const r of results) {
  const label = r.part ? `batch-${r.batchIndex}-part-${r.part}.json` : `batch-${r.batchIndex}.json`;
  console.log(`${label}: ${r.nodes} nodes, ${r.edges} edges`);
  totalN += r.nodes;
  totalE += r.edges;
}
console.log(`\nTOTAL: ${totalN} nodes, ${totalE} edges across ${results.length} files`);
