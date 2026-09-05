import { parseRoute, routeToHash, type ViewerRoute } from "@render/core";

/** One address interface for navigation, citations, and reader-locus updates. */
export function viewerAddress(source: () => string | undefined) {
  return (target: ViewerRoute | string): string => {
    if (typeof target === "string" && !target.startsWith("#/")) return target;
    const route = typeof target === "string" ? parseRoute(target) : target;
    return routeToHash({ ...route, src: route.src ?? source() });
  };
}
