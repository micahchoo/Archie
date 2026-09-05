import { beforeEach, describe, expect, it, vi } from "vitest";
import OpenSeadragon from "openseadragon";
import { createReadOnlyMount } from "./read-mount.js";

// OSD is the external adapter: leave source resolution, open lifecycle and read-only wiring real.
vi.mock("openseadragon", () => ({ default: vi.fn() }));

describe("cancelling a read-only open", () => {
  const destroy = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(OpenSeadragon).mockImplementation(() => ({
      canvas: document.createElement("div"),
      addOnceHandler: vi.fn(),
      destroy,
    }) as unknown as OpenSeadragon.Viewer);
  });

  it("destroys a pending OSD viewer when the caller abandons the open", async () => {
    const abort = new AbortController();
    const opening = createReadOnlyMount(document.createElement("div"), {
      source: "https://images.test/pending.jpg", signal: abort.signal,
    });
    const rejected = expect(opening).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(OpenSeadragon).toHaveBeenCalledOnce());
    abort.abort();
    await rejected;
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("an already cancelled open never constructs a viewer or starts loading its source", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(createReadOnlyMount(document.createElement("div"), {
      source: "https://images.test/unused.jpg", signal: abort.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(OpenSeadragon).not.toHaveBeenCalled();
  });
});
