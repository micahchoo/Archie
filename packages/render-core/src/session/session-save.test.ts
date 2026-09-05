import { describe, expect, it } from "vitest";
import { AnnotationSession } from "./session.js";
import { MemoryFilesystem } from "../fs/memory.js";
import type { FsDirectory } from "../fs/seam.js";
import { asClientId } from "../wadm/brand.js";

const editor = asClientId("save-test");
const note = (value: string) => ({ target: "https://example.test/canvas", body: { type: "TextualBody" as const, value } });

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Suspend the first filesystem access of a save, without suspending authoring. */
function gate(inner: FsDirectory) {
  const entered = deferred();
  const release = deferred();
  let first = true;
  const dir: FsDirectory = {
    getDirectory: (name, opts) => inner.getDirectory(name, opts),
    getFile: async (name, opts) => {
      if (first) { first = false; entered.resolve(); await release.promise; }
      return inner.getFile(name, opts);
    },
    entries: () => inner.entries(),
    remove: (name) => inner.remove(name),
  };
  return { dir, entered: entered.promise, release };
}

describe("save acknowledgement", () => {
  for (const mode of ["full", "incremental", "after merge"] as const) {
    it(`${mode}: a same-note edit during I/O survives the next save and reload with its history`, async () => {
      const root = await new MemoryFilesystem().root();
      const session = new AnnotationSession(editor);
      const id = session.createNote(note("v1"));
      if (mode !== "full") await session.save(root);
      session.editNote(id, { body: note("v2").body });
      if (mode === "after merge") {
        const colleague = new AnnotationSession(editor);
        colleague.createNote(note("incoming"));
        session.importChanges(colleague.entries);
      }
      const blocked = gate(root);
      const saving = session.save(blocked.dir);
      await blocked.entered;
      session.editNote(id, { body: note("v3").body });
      blocked.release.resolve();
      await saving;
      await session.save(root);
      const reopened = await AnnotationSession.load(root, editor);
      expect(new Set(reopened.entries.map((r) => r.rev))).toEqual(new Set(session.entries.map((r) => r.rev)));
      expect(reopened.notes().find((r) => r.logicalId === id)?.body).toEqual(note("v3").body);
    });

    it(`${mode}: failed I/O retains both the drained edit and edits authored during the attempt`, async () => {
      const root = await new MemoryFilesystem().root();
      const session = new AnnotationSession(editor);
      const id = session.createNote(note("v1"));
      const other = session.createNote(note("other"));
      if (mode !== "full") await session.save(root);
      session.editNote(id, { body: note("v2").body });
      if (mode === "after merge") session.importChanges(session.entries);
      const blocked = gate(root);
      const saving = session.save(blocked.dir);
      const rejected = expect(saving).rejects.toThrow("quota");
      await blocked.entered;
      session.editNote(other, { body: note("edited during save").body });
      session.createNote(note("new during save"));
      blocked.release.reject(new Error("quota"));
      await rejected;
      await session.save(root);
      const reopened = await AnnotationSession.load(root, editor);
      expect(new Set(reopened.entries.map((r) => r.rev))).toEqual(new Set(session.entries.map((r) => r.rev)));
      expect(reopened.notes()).toHaveLength(3);
    });
  }

  it.each([false, true])("a merge during a save (prior baseline: %s) requires the imported pages on the next save", async (persisted) => {
    const root = await new MemoryFilesystem().root();
    const session = new AnnotationSession(editor);
    session.createNote(note("local"));
    if (persisted) await session.save(root);
    const colleague = new AnnotationSession(editor);
    colleague.createNote(note("incoming"));
    const blocked = gate(root);
    const saving = session.save(blocked.dir);
    await blocked.entered;
    session.importChanges(colleague.entries);
    blocked.release.resolve();
    await saving;
    await session.save(root);
    const reopened = await AnnotationSession.load(root, editor);
    expect(new Set(reopened.entries.map((r) => r.rev))).toEqual(new Set(session.entries.map((r) => r.rev)));
  });

  it("overlapping saves cannot let an older snapshot replace a newer one", async () => {
    const root = await new MemoryFilesystem().root();
    const session = new AnnotationSession(editor);
    const id = session.createNote(note("old"));
    const blocked = gate(root);
    const first = session.save(blocked.dir);
    await blocked.entered;
    session.editNote(id, { body: note("new").body });
    const second = session.save(root);
    blocked.release.resolve();
    await Promise.all([first, second]);
    expect((await AnnotationSession.load(root, editor)).entries).toEqual(session.entries);
  });

  it("a failed page write settles its siblings before a queued retry can replace them", async () => {
    const root = await new MemoryFilesystem().root();
    const session = new AnnotationSession(editor);
    const a = session.createNote(note("a"));
    const b = session.createNote(note("b old"));
    const entered = deferred();
    const release = deferred();
    const failure = new Error("page quota failure");
    const wrap = (inner: FsDirectory, history = false): FsDirectory => ({
      getDirectory: async (name, opts) => wrap(await inner.getDirectory(name, opts), name === "history"),
      getFile: async (name, opts) => {
        if (history && name === `${a}.json`) throw failure;
        const file = await inner.getFile(name, opts);
        if (!history || name !== `${b}.json`) return file;
        return {
          readable: () => file.readable(), getFile: () => file.getFile(), size: () => file.size(),
          writable: async () => {
            const writer = await file.writable();
            return {
              write: (data) => writer.write(data),
              close: async () => { entered.resolve(); await release.promise; await writer.close(); },
            };
          },
        };
      },
      entries: () => inner.entries(), remove: (name) => inner.remove(name),
    });
    let settled = false;
    const first = session.save(wrap(root));
    void first.then(() => { settled = true; }, () => { settled = true; });
    const rejected = expect(first).rejects.toBe(failure);
    await entered.promise;
    session.editNote(b, { body: note("b new").body });
    const retry = session.save(root);
    // Allow rejection continuations to run while the sibling's commit remains suspended.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    release.resolve();
    await rejected;
    await retry;
    expect((await AnnotationSession.load(root, editor)).entries).toEqual(session.entries);
  });
});
