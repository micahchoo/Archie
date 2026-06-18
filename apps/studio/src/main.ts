import "./tokens.css";
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
