import { mediaFragmentValue, parseMediaFragment } from "@render/core";

/** The seek prop for an AV narrative section, preserving authored temporal starts. */
export function narrativeSeekOf(start: string | undefined): string | undefined {
  const time = parseMediaFragment(start ?? "").time;
  return time ? mediaFragmentValue({ time }) : undefined;
}
