import { runConformance, runReadConformance, seedWritableFs } from "./conformance.js";
import { MemoryFilesystem } from "./memory.js";
import { ZipFilesystem } from "./zip.js";

// The two node-testable backends must satisfy the seam identically. (FsaFilesystem is
// browser-only — typechecked against the DOM FSA API, verified in the browser.)
runConformance("MemoryFilesystem", () => new MemoryFilesystem());
runConformance("ZipFilesystem", () => new ZipFilesystem());

// The read-only subset (what HttpFilesystem runs — http.conformance.test.ts) must ALSO hold for
// the writable backends, seeded by writes: that's what makes it the shared contract's read half
// rather than an HTTP-shaped suite of its own.
runReadConformance("MemoryFilesystem (seeded)", (files) => seedWritableFs(new MemoryFilesystem(), files));
runReadConformance("ZipFilesystem (seeded)", (files) => seedWritableFs(new ZipFilesystem(), files));
