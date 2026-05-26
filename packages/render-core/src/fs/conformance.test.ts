import { runConformance } from "./conformance.js";
import { MemoryFilesystem } from "./memory.js";
import { ZipFilesystem } from "./zip.js";

// The two node-testable backends must satisfy the seam identically. (FsaFilesystem is
// browser-only — typechecked against the DOM FSA API, verified in the browser.)
runConformance("MemoryFilesystem", () => new MemoryFilesystem());
runConformance("ZipFilesystem", () => new ZipFilesystem());
