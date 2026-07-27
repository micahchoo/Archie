// Stamping `webkitRelativePath` onto a File — the ONE place that is allowed to do it (Archie-ce7a).
//
// THE BUG THIS EXISTS TO PREVENT, measured in the packaged desktop app on 2026-07-26:
//
//     TypeError: Attempted to assign to readonly property.   (assign@[native code])
//
// `Object.assign(file, { webkitRelativePath })` is the technique three call sites used, on the
// documented belief that "webkitRelativePath is a plain own property on a File instance, not a
// prototype-locked accessor". That belief is TRUE IN CHROMIUM AND FALSE IN JAVASCRIPTCORE. WebKitGTK
// defines it as a getter-only accessor on File.prototype, and `Object.assign` performs an ordinary
// [[Set]], which walks the prototype chain, finds an accessor with no setter, and throws — ES modules
// are always strict mode, so it throws rather than silently no-oping.
//
// The consequence was NOT limited to the new native picker. Every folder path in Studio stamps this
// property, so on desktop the drag-and-drop walker (folder-drop.ts) and the "one exhibit from
// everything" flatten choice threw the same TypeError. Nobody had found it because nobody had driven
// the packaged app; jsdom and Chromium-based Playwright both implement the Chromium shape, so every
// unit test and every browser e2e passes against code the desktop build cannot run.
//
// THE FIX. `Object.defineProperty` performs [[DefineOwnProperty]], which installs an OWN data
// property that shadows the prototype accessor instead of invoking it. That works on both engines,
// so this is not a desktop special case — it is simply the correct way to shadow an inherited
// accessor, and all three call sites use it.
//
// Do not "simplify" any call site back to Object.assign or to `file.webkitRelativePath = x`. Both
// are [[Set]] and both reintroduce the crash on desktop while looking perfectly fine in every test
// this repo can run headlessly. See .claude/rules/ for the general form: a gate answers the question
// it was asked, and "does the shipping engine allow this?" is not a question jsdom can be asked.

/**
 * Return `file` with `webkitRelativePath` set to `path`, stamped as an own data property.
 *
 * Mutates and returns the same File (callers rely on identity — the ingest carries these straight
 * through to addObjectFromFile). Constructing a fresh File is the caller's business when it wants a
 * copy; see CreateExhibitDialog's flatten path, which deliberately builds new instances so the
 * picked files' original per-subfolder paths are left untouched.
 */
export function withRelativePath(file: File, path: string): File {
  Object.defineProperty(file, "webkitRelativePath", {
    value: path,
    writable: false,
    enumerable: true,
    configurable: true,
  });
  return file;
}
