import { getContext } from "svelte";
import { viewerAddress } from "./viewer-address.js";

export const VIEWER_ADDRESS = Symbol("viewer-address");
export function useViewerAddress(): ReturnType<typeof viewerAddress> {
  return getContext(VIEWER_ADDRESS) ?? viewerAddress(() => undefined);
}
