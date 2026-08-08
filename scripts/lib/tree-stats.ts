// Shared tree accounting for the scripts/ publish-driving harnesses (architecture deepening wave 1).
//
// One home for the bytes/files report the publish scripts used to hand-roll after dumping a finished
// tree to disk: `collectFiles` flattens the seam tree, and this sums the byte counts the way the old
// per-script write loops did (text → utf8, binary → base64 decode). Consumers: republish-tree.mts,
// deposit-fixture.mts, proto/self-replicating-publish.mts. A change to any of these belongs HERE,
// not in a per-script copy.
import { collectFiles, type Filesystem } from "@render/core";

/** Flatten a published tree through `collectFiles` and return its file count + byte size. */
export async function treeStats(fs: Filesystem): Promise<{ files: number; bytes: number }> {
  const files = await collectFiles(await fs.root());
  let bytes = 0;
  for (const content of Object.values(files)) {
    const buf = "text" in content ? Buffer.from(content.text, "utf8") : Buffer.from(content.base64, "base64");
    bytes += buf.length;
  }
  return { files: Object.keys(files).length, bytes };
}
