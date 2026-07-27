// The SHARED token layer (Archie-ecf4) — render-core is layer zero, so the author, the reader and the
// embed all read ONE file. Studio kept a byte-copy here until 2026-07-27 and it had drifted both ways;
// see the header of packages/render-core/src/tokens.css. Must stay FIRST: markers.css and
// atmosphere.css below resolve var()s declared by it, and source order is the cascade here.
import "@render/core/tokens.css";
import "@annotorious/openseadragon/annotorious-openseadragon.css";
import "@annotorious/plugin-tools/annotorious-plugin-tools.css";
import "./markers.css"; // A2 + stroke-over-stroke marker styling — must load AFTER Annotorious CSS
import "./atmosphere.css"; // Soft Static atmosphere (gradient ground + grain + bloom) — must load LAST (wins source order)
import { mount } from "svelte";
import App from "./App.svelte";

// Phase 0 boundary shell entry. Phase 2 mounts anvil's adopted editor shell here.
const target = document.getElementById("app");
if (!target) throw new Error("missing #app mount target");

export default mount(App, { target });
