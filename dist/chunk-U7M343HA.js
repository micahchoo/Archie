import{a as L,b as v}from"./chunk-4SLSEVNN.js";import{P as M,R as D,x as z}from"./chunk-GW5XXYOX.js";function $(a,r){if(!r)return{html:"",media:[]};let t=a.find(e=>String(e.id)===r);if(!t)return{html:"",media:[]};let{media:o,text:m}=M(z(t));return{html:D(m),media:o}}var O=`
  .archie-note-card {
    max-height: 100%; box-sizing: border-box; overflow: auto; padding: var(--space-4) var(--space-5);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: none; border-left: 2px solid var(--accent);
    font: inherit; font-size: .95rem; line-height: 1.45; position: relative;
  }
  .archie-note-card__actions { position: absolute; top: 6px; right: 8px; display: flex; gap: 2px; }
  .archie-note-card__actions button {
    border: none; background: transparent; color: var(--ink-paper-secondary);
    font-size: 1.1rem; line-height: 1; cursor: pointer; padding: 2px 5px; border-radius: var(--radius-sm);
  }
  .archie-note-card__actions button:hover { color: var(--accent-2); background: var(--surface-paper-hover); }

  /* Media strip \u2014 the shell's NoteMedia.svelte tile in plain DOM (132x92, zoom-in cursor). The fixed
     tile is Archie's own shell idiom; no corpus viewer constrains a body image on the read side
     (clover renders it at natural width, annomea caps it at container width \u2014 see the ledger). */
  .archie-note-media { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
  .archie-note-media button.tile {
    position: relative; width: 132px; height: 92px; padding: 0; overflow: hidden; cursor: zoom-in;
    border: 1px solid var(--border-paper); border-radius: var(--radius-sm); background: var(--surface-paper-card);
  }
  .archie-note-media button.tile:hover { border-color: var(--accent-2); }
  .archie-note-media button.tile > img, .archie-note-media button.tile > video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .archie-note-media .badge {
    position: absolute; right: 4px; bottom: 3px; padding: 0 4px; border-radius: var(--radius-sm);
    background: var(--accent-2); color: var(--surface-canvas-raised); font-size: .7rem; line-height: 1.4;
  }
  .archie-note-media .wave { display: flex; align-items: center; justify-content: center; gap: 2px; width: 100%; height: 100%; }
  .archie-note-media .wave i { display: block; width: 3px; background: var(--accent-2); border-radius: 2px; }
  .archie-note-media .tile-failed {
    display: grid; place-items: center; width: 132px; height: 92px; padding: 0 var(--space-2);
    border: 1px dashed var(--border-paper); border-radius: var(--radius-sm);
    color: var(--ink-paper-muted); font-size: .78rem; text-align: center;
  }

  /* The reading sheet. ABSOLUTE within the element (':host' is position:relative), never 'fixed':
     an embed must stay inside its own box \u2014 a fixed overlay would be clipped by the host's iframe
     anyway, and escaping to document.body (the shell's ProseCites portal trick) would leave the
     shadow root and lose every token this file styles against. */
  .archie-note-sheet-layer { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; }
  /* MUST come with the rule above, and must stay. A class selector outranks the UA's '[hidden] {
     display: none }', so 'display: grid' alone leaves the layer laid out at all times \u2014 a
     full-element transparent div at z-index 60, silently eating every click on the canvas beneath it.
     recipes/smoke.mjs caught exactly that: the region hit-test started returning the layer, and
     'a real mouse click on a region opens its note' went red. Same shape as the OSD overlay wrapper
     in .claude/rules/osd-overlay-wrapper.md \u2014 an invisible box that is nonetheless the topmost hit
     target. Any future rule that sets 'display' on a toggled element needs its own [hidden] pair. */
  .archie-note-sheet-layer[hidden] { display: none; }
  .archie-note-sheet-scrim { position: absolute; inset: 0; background: var(--moss-shadow); opacity: .55; }
  /* Scrim and sheet are SIBLINGS, not nested \u2014 the shell's idiom (NoteLightbox.svelte:38/43,
     ReadingSheet.svelte:48/49). That is precisely why no stopPropagation appears anywhere here:
     a click inside the sheet can never reach the scrim. */
  .archie-note-sheet {
    position: relative; width: min(92%, 680px); max-height: 86%; box-sizing: border-box;
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lift-mid);
  }
  .archie-note-sheet__head { display: flex; justify-content: flex-end; padding: var(--space-2) var(--space-2) 0; }
  .archie-note-sheet__head button {
    border: none; background: transparent; color: var(--ink-paper-secondary);
    font-size: 1.2rem; line-height: 1; cursor: pointer; padding: 4px 7px; border-radius: var(--radius-sm);
  }
  .archie-note-sheet__head button:hover { color: var(--accent-2); background: var(--surface-paper-hover); }
  .archie-note-sheet__body {
    overflow: auto; padding: 0 var(--space-6) var(--space-6);
    font-size: 1.05rem; line-height: 1.6; max-width: 62ch;
  }
  /* At sheet size the media is the point, so it is shown rather than tiled \u2014 capped to the sheet's
     width (annomea app.css:101 is the same container cap) with the author's description as a VISIBLE
     caption. clover-iiif Image.tsx:18 is the precedent for the caption: it renders the body's own
     description as text beside a templated alt, rather than hiding it in an attribute. */
  .archie-note-sheet .archie-note-figures { display: flex; flex-direction: column; gap: var(--space-4); margin-top: var(--space-4); }
  .archie-note-sheet figure { margin: 0; }
  .archie-note-sheet figure > img, .archie-note-sheet figure > video, .archie-note-sheet figure > audio {
    display: block; width: 100%; max-width: 100%; border-radius: var(--radius-sm);
  }
  .archie-note-sheet figcaption { margin-top: var(--space-2); font-size: .85rem; color: var(--ink-paper-secondary); }
  .archie-note-sheet .figure-failed { padding: var(--space-3); border: 1px dashed var(--border-paper); border-radius: var(--radius-sm); color: var(--ink-paper-muted); font-size: .85rem; }
`;function P(a,r){return a.nodeType===9?a.body??r.body:a}function H(a,r){if(a.querySelector("style[data-archie-note]"))return;let t=r.createElement("style");t.setAttribute("data-archie-note",""),t.textContent=O,P(a,r).appendChild(t)}var B=Array.from({length:11},(a,r)=>28+r*53%64);function j(a,r){return a.alt?`${r} ${a.kind}: ${a.alt}`:`${r} ${a.kind}`}function w(a,r,t){let o=a.ownerDocument;if(v(a),a.textContent="",r.html){let e=o.createElement("div");e.className="archie-note-card__prose",e.append(t.resources.html(o,r.html)),a.appendChild(e)}if(r.media.length===0)return;if(t.size==="card"){let e=o.createElement("div");e.className="archie-note-media",r.media.forEach((d,s)=>{if(!t.resources.allows(d.url)||t.failed.has(d.url)){let i=o.createElement("span");i.className="tile-failed",i.textContent="Couldn't load",e.appendChild(i);return}let n=o.createElement("button");n.type="button",n.className=`tile ${d.kind}`,n.setAttribute("aria-label",j(d,"Open"));let c=()=>{a.isConnected&&(t.failed.add(d.url),w(a,r,t))};if(d.kind==="image"){let i=o.createElement("img");i.src=d.url,i.alt="",i.loading="lazy",i.addEventListener("error",c),n.appendChild(i)}else if(d.kind==="video"){let i=o.createElement("video");i.src=d.url,i.muted=!0,i.preload="metadata",i.tabIndex=-1,i.addEventListener("error",c);let l=o.createElement("span");l.className="badge",l.setAttribute("aria-hidden","true"),l.textContent="\u25B6",n.append(i,l)}else{let i=o.createElement("span");i.className="wave",i.setAttribute("aria-hidden","true");for(let h of B){let f=o.createElement("i");f.style.height=`${h}%`,i.appendChild(f)}let l=o.createElement("span");l.className="badge",l.setAttribute("aria-hidden","true"),l.textContent="\u266A",n.append(i,l)}n.addEventListener("click",()=>t.onmedia?.(s)),e.appendChild(n)}),a.appendChild(e);return}let m=o.createElement("div");m.className="archie-note-figures";for(let e of r.media){let d=o.createElement("figure");if(!t.resources.allows(e.url)||t.failed.has(e.url)){let n=o.createElement("p");n.className="figure-failed",n.textContent=e.alt?`Couldn't load this ${e.kind}: ${e.alt}`:`Couldn't load this ${e.kind}.`,d.appendChild(n),m.appendChild(d);continue}let s=()=>{a.isConnected&&(t.failed.add(e.url),w(a,r,t))};if(e.kind==="image"){let n=o.createElement("img");n.src=e.url,n.alt=e.alt??"",n.addEventListener("error",s),d.appendChild(n)}else{let n=o.createElement(e.kind==="video"?"video":"audio");n.src=e.url,n.controls=!0,e.alt&&n.setAttribute("aria-label",e.alt),n.addEventListener("error",s),d.appendChild(n)}if(e.alt){let n=o.createElement("figcaption");n.textContent=e.alt,d.appendChild(n)}m.appendChild(d)}a.appendChild(m)}function T(a){return[...a.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(t=>t.getClientRects().length>0)}function U(a,r=new L){let t=a.ownerDocument,o=a.getRootNode();H(o,t);let m=new Set,e={html:"",media:[]},d=!1,s=t.createElement("div");s.className="archie-note-card",s.setAttribute("role","complementary"),s.setAttribute("aria-label","Note"),s.hidden=!0;let n=t.createElement("div");n.className="archie-note-card__actions";let c=t.createElement("button");c.type="button",c.className="archie-note-card__expand",c.setAttribute("aria-label","Expand note to a reading sheet"),c.title="Expand note to a reading sheet",c.textContent="\u2922",c.hidden=!0;let i=t.createElement("button");i.type="button",i.className="archie-note-card__dismiss",i.setAttribute("aria-label","Close note"),i.textContent="\xD7",i.addEventListener("click",()=>C()),n.append(c,i);let l=t.createElement("div");l.className="archie-note-card__body",s.append(n,l),a.appendChild(s);let h=t.createElement("div");h.className="archie-note-sheet-layer",h.hidden=!0;let f=t.createElement("div");f.className="archie-note-sheet-scrim",f.addEventListener("click",()=>x());let p=t.createElement("div");p.className="archie-note-sheet",p.setAttribute("role","dialog"),p.setAttribute("aria-modal","true"),p.setAttribute("aria-label","Note"),p.tabIndex=-1;let E=t.createElement("div");E.className="archie-note-sheet__head";let g=t.createElement("button");g.type="button",g.setAttribute("aria-label","Close reading sheet"),g.textContent="\xD7",g.addEventListener("click",()=>x()),E.appendChild(g);let b=t.createElement("div");b.className="archie-note-sheet__body",p.append(E,b),h.append(f,p),P(o,t).appendChild(h),h.addEventListener("keydown",k=>{let u=k;if(u.key==="Escape"){u.preventDefault(),u.stopPropagation(),x();return}if(u.key!=="Tab")return;let y=T(p);if(y.length===0){u.preventDefault();return}let A=y[0],S=y[y.length-1],N=o.activeElement??t.activeElement;u.shiftKey&&(N===A||N===p)?(u.preventDefault(),S.focus()):!u.shiftKey&&N===S&&(u.preventDefault(),A.focus())});function _(){d||!e.html&&e.media.length===0||(d=!0,w(b,e,{size:"sheet",resources:r,failed:m,onmedia:void 0}),h.hidden=!1,s.hidden=!0,(T(p)[0]??p).focus())}function x(){d&&(d=!1,h.hidden=!0,v(b),b.textContent="",s.hidden=!1,c.focus())}c.addEventListener("click",()=>_());function R(k,u){if(e=$(k,u),!e.html&&e.media.length===0){C();return}w(l,e,{size:"card",resources:r,failed:m,onmedia:()=>_()}),c.hidden=!1,s.hidden=!1}function C(){d&&x(),s.hidden=!0,c.hidden=!0,v(l),l.textContent="",e={html:"",media:[]}}function I(){v(s),v(h),s.remove(),h.remove()}return{showNote:R,hide:C,destroy:I}}export{U as a};
