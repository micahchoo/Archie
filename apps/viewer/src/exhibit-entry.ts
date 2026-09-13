import annotoriousCss from "@annotorious/openseadragon/annotorious-openseadragon.css?raw";
import toolsCss from "@annotorious/plugin-tools/annotorious-plugin-tools.css?raw";
import markerCss from "./markers.css?raw";

const STYLE_ATTRIBUTE = "data-archie-exhibit-styles";

// Vendor CSS is not owned by Svelte, so install it with the lazy exhibit entry. The order is
// significant: Archie marker rules intentionally override Annotorious and its tools plugin.
if (typeof document !== "undefined" && !document.head.querySelector(`style[${STYLE_ATTRIBUTE}]`)) {
  const style = document.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = `${annotoriousCss}\n${toolsCss}\n${markerCss}`;
  document.head.append(style);
}

export { default } from "./components/ExhibitView.svelte";
