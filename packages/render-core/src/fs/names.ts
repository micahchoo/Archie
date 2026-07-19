// Shared name-containment guard for the PATH-JOINING backends (Tauri joins a segment onto a
// native filesystem path; HTTP joins one onto a base URL). The browser FSA/OPFS backends get
// this for free — getFileHandle/getDirectoryHandle reject a name containing "/" — so any
// backend that string-joins a caller-supplied segment must re-establish it itself (the
// tauri-fs-seam rule; donor pattern go-iiif doctor.go `safeBundleRelative`, landed in 42246f1).

/**
 * Reject a child name that could escape its parent before it is joined onto a real path or URL.
 * Mirrors the FSA rule set: empty, ".", "..", or any name bearing a separator / NUL is invalid.
 * Callers upstream must NOT be trusted to have sanitized the segment — exhibit slugs, object ids,
 * and archive entry names are untrusted input (same trust boundary as the untrusted-archive
 * open seam).
 */
export function assertSafeName(name: string): void {
  if (name === "" || name === "." || name === ".." || /[/\\]/.test(name) || name.includes("\0")) {
    throw new Error(`unsafe path segment: ${JSON.stringify(name)}`);
  }
}
