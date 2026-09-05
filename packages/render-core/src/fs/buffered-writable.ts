import type { FsWritable } from "./seam.js";

/** In-memory sinks collect immutable chunks, then replace the file once on close. Concatenate once
 * to keep repeated writes linear in bytes; copying incoming buffers prevents later caller mutation. */
export function bufferedWritable(commit: (bytes: Uint8Array<ArrayBuffer>) => void): FsWritable {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  return {
    write: async (data) => {
      chunks.push(typeof data === "string" ? new TextEncoder().encode(data)
        : data instanceof ArrayBuffer ? new Uint8Array(data.slice(0))
        : new Uint8Array(await data.arrayBuffer()));
    },
    close: async () => {
      if (chunks.length === 1) { commit(chunks[0]!); return; }
      const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      commit(bytes);
    },
  };
}
