import{N as S,P as L,u as A}from"./chunk-HABINQOH.js";function I(n,t){if(!t)return{html:"",media:[]};let o=n.find(a=>String(a.id)===t);if(!o)return{html:"",media:[]};let{media:d,text:l}=S(A(o));return{html:L(l),media:d}}var P=`
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
`;function M(n,t){return n.nodeType===9?n.body??t.body:n}function $(n,t){if(n.querySelector("style[data-archie-note]"))return;let o=t.createElement("style");o.setAttribute("data-archie-note",""),o.textContent=P,M(n,t).appendChild(o)}var R=Array.from({length:11},(n,t)=>28+t*53%64);function H(n,t){return n.alt?`${t} ${n.kind}: ${n.alt}`:`${t} ${n.kind}`}function x(n,t,o){let d=n.ownerDocument;if(n.textContent="",t.html){let a=d.createElement("div");a.className="archie-note-card__prose",a.innerHTML=t.html,n.appendChild(a)}if(t.media.length===0)return;if(o.size==="card"){let a=d.createElement("div");a.className="archie-note-media",t.media.forEach((i,u)=>{if(o.failed.has(i.url)){let r=d.createElement("span");r.className="tile-failed",r.textContent="Couldn't load",a.appendChild(r);return}let e=d.createElement("button");e.type="button",e.className=`tile ${i.kind}`,e.setAttribute("aria-label",H(i,"Open"));let p=()=>{o.failed.add(i.url),x(n,t,o)};if(i.kind==="image"){let r=d.createElement("img");r.src=i.url,r.alt="",r.loading="lazy",r.addEventListener("error",p),e.appendChild(r)}else if(i.kind==="video"){let r=d.createElement("video");r.src=i.url,r.muted=!0,r.preload="metadata",r.tabIndex=-1,r.addEventListener("error",p);let s=d.createElement("span");s.className="badge",s.setAttribute("aria-hidden","true"),s.textContent="\u25B6",e.append(r,s)}else{let r=d.createElement("span");r.className="wave",r.setAttribute("aria-hidden","true");for(let m of R){let c=d.createElement("i");c.style.height=`${m}%`,r.appendChild(c)}let s=d.createElement("span");s.className="badge",s.setAttribute("aria-hidden","true"),s.textContent="\u266A",e.append(r,s)}e.addEventListener("click",()=>o.onmedia?.(u)),a.appendChild(e)}),n.appendChild(a);return}let l=d.createElement("div");l.className="archie-note-figures";for(let a of t.media){let i=d.createElement("figure");if(o.failed.has(a.url)){let e=d.createElement("p");e.className="figure-failed",e.textContent=a.alt?`Couldn't load this ${a.kind}: ${a.alt}`:`Couldn't load this ${a.kind}.`,i.appendChild(e),l.appendChild(i);continue}let u=()=>{o.failed.add(a.url),x(n,t,o)};if(a.kind==="image"){let e=d.createElement("img");e.src=a.url,e.alt=a.alt??"",e.addEventListener("error",u),i.appendChild(e)}else{let e=d.createElement(a.kind==="video"?"video":"audio");e.src=a.url,e.controls=!0,a.alt&&e.setAttribute("aria-label",a.alt),e.addEventListener("error",u),i.appendChild(e)}if(a.alt){let e=d.createElement("figcaption");e.textContent=a.alt,i.appendChild(e)}l.appendChild(i)}n.appendChild(l)}function z(n){return[...n.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(o=>o.getClientRects().length>0)}function B(n){let t=n.ownerDocument,o=n.getRootNode();$(o,t);let d=new Set,l={html:"",media:[]},a=!1,i=t.createElement("div");i.className="archie-note-card",i.setAttribute("role","complementary"),i.setAttribute("aria-label","Note"),i.hidden=!0;let u=t.createElement("div");u.className="archie-note-card__actions";let e=t.createElement("button");e.type="button",e.className="archie-note-card__expand",e.setAttribute("aria-label","Expand note to a reading sheet"),e.title="Expand note to a reading sheet",e.textContent="\u2922",e.hidden=!0;let p=t.createElement("button");p.type="button",p.className="archie-note-card__dismiss",p.setAttribute("aria-label","Close note"),p.textContent="\xD7",p.addEventListener("click",()=>w()),u.append(e,p);let r=t.createElement("div");r.className="archie-note-card__body",i.append(u,r),n.appendChild(i);let s=t.createElement("div");s.className="archie-note-sheet-layer",s.hidden=!0;let m=t.createElement("div");m.className="archie-note-sheet-scrim",m.addEventListener("click",()=>b());let c=t.createElement("div");c.className="archie-note-sheet",c.setAttribute("role","dialog"),c.setAttribute("aria-modal","true"),c.setAttribute("aria-label","Note"),c.tabIndex=-1;let y=t.createElement("div");y.className="archie-note-sheet__head";let f=t.createElement("button");f.type="button",f.setAttribute("aria-label","Close reading sheet"),f.textContent="\xD7",f.addEventListener("click",()=>b()),y.appendChild(f);let v=t.createElement("div");v.className="archie-note-sheet__body",c.append(y,v),s.append(m,c),M(o,t).appendChild(s),s.addEventListener("keydown",E=>{let h=E;if(h.key==="Escape"){h.preventDefault(),h.stopPropagation(),b();return}if(h.key!=="Tab")return;let g=z(c);if(g.length===0){h.preventDefault();return}let N=g[0],_=g[g.length-1],k=o.activeElement??t.activeElement;h.shiftKey&&(k===N||k===c)?(h.preventDefault(),_.focus()):!h.shiftKey&&k===_&&(h.preventDefault(),N.focus())});function C(){a||!l.html&&l.media.length===0||(a=!0,x(v,l,{size:"sheet",failed:d,onmedia:void 0}),s.hidden=!1,i.hidden=!0,(z(c)[0]??c).focus())}function b(){a&&(a=!1,s.hidden=!0,v.textContent="",i.hidden=!1,e.focus())}e.addEventListener("click",()=>C());function T(E,h){if(l=I(E,h),!l.html&&l.media.length===0){w();return}x(r,l,{size:"card",failed:d,onmedia:()=>C()}),e.hidden=!1,i.hidden=!1}function w(){a&&b(),i.hidden=!0,e.hidden=!0,r.textContent="",l={html:"",media:[]}}function D(){i.remove(),s.remove()}return{showNote:T,hide:w,destroy:D}}export{I as a,B as b};
