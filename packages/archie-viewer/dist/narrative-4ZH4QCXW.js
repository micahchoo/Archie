import{c as E,d as g}from"./chunk-LY6PU76L.js";import{a as h,b as y}from"./chunk-4SLSEVNN.js";import{R as k}from"./chunk-GW5XXYOX.js";var w=`
  .nr-aside { display: flex; flex-direction: column; min-height: 100%; padding: var(--space-5); box-sizing: border-box; font-family: var(--font-body); color: var(--ink-paper-primary); }
  .nr-eyebrow { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-paper-secondary); margin: 0 0 var(--space-2); }
  .nr-title { font-family: var(--font-display-2); font-weight: 400; font-size: 1.35rem; margin: 0 0 var(--space-4); }
  .nr-sections { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); flex: 1 1 auto; }
  .nr-sections > li { margin: 0; }
  .nr-sections button {
    display: block; width: 100%; text-align: left; cursor: pointer; font: inherit; color: inherit;
    padding: var(--space-3) var(--space-4); border: 1px solid var(--border-paper); border-left: 3px solid transparent;
    border-radius: var(--radius-sm); background: var(--surface-paper-card);
  }
  .nr-sections button:hover { background: var(--surface-paper-hover); }
  .nr-sections button[aria-current="true"] { border-left-color: var(--accent); background: var(--surface-paper-hover); }
  .nr-sections .nr-num { display: block; font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-paper-secondary); margin-bottom: var(--space-2); }
  .nr-sections .nr-prose { font-size: .92rem; line-height: 1.6; }
  .nr-sections .nr-prose > :first-child { margin-top: 0; }
  .nr-sections .nr-prose > :last-child { margin-bottom: 0; }
  .nr-sections .nr-prose a { color: var(--accent-2-paper); }
  /* Collapsed rows keep the spine scannable: only the ACTIVE section shows its prose in full. */
  .nr-sections button:not([aria-current="true"]) .nr-prose { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--ink-paper-secondary); }
  .nr-foot { position: sticky; bottom: 0; margin: var(--space-5) calc(-1 * var(--space-5)) calc(-1 * var(--space-5)); padding: var(--space-3) var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); background: var(--surface-paper); border-top: 1px solid var(--border-canvas); }
  .nr-foot .nr-index { align-self: start; display: inline-flex; align-items: center; gap: var(--space-2); background: none; border: none; padding: var(--space-1) 0; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-paper-secondary); }
  .nr-foot .nr-index:hover { color: var(--accent-2); }
  .nr-stepper { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .nr-stepper button { display: inline-flex; align-items: center; gap: var(--space-1); background: none; border: none; padding: var(--space-2); cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-paper-secondary); }
  .nr-stepper button:hover:not(:disabled) { color: var(--accent-2); }
  .nr-stepper button:disabled { opacity: .32; cursor: default; }
  .nr-pos { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: var(--text-ui-sm); letter-spacing: .08em; color: var(--ink-paper-muted); }
`;function A(l){return l.sections??[]}function L(l,r){let e=l.ownerDocument,n=A(r.exhibit),d=Math.min(Math.max(r.index,0),Math.max(n.length-1,0)),N=E(l,w,"data-archie-narrative"),a=e.createElement("div");a.className="nr-aside";let b=e.createElement("p");b.className="nr-eyebrow",b.textContent=`Narrative \xB7 ${n.length} ${n.length===1?"section":"sections"}`+(n.length>1?` \xB7 ${g(d,n.length,"Section")}`:"");let x=e.createElement("h1");x.className="nr-title",x.textContent=r.exhibit.title,a.append(b,x);let f=e.createElement("ol");f.className="nr-sections",f.setAttribute("aria-label","Sections"),n.forEach((s,c)=>{let p=e.createElement("li"),t=e.createElement("button");t.type="button",t.dataset.section=String(c),c===d&&t.setAttribute("aria-current","true");let v=e.createElement("span");v.className="nr-num",v.textContent=s.title;let u=e.createElement("div");u.className="nr-prose",u.append((r.resources??new h).html(e,k(s.prose??""))),t.append(v,u),t.addEventListener("click",()=>r.onactivate(c)),p.append(t),f.append(p)}),a.append(f);let m=e.createElement("nav");m.className="nr-foot",m.setAttribute("aria-label","Narrative");let i=e.createElement("button");if(i.type="button",i.className="nr-index",i.dataset.act="index",i.textContent="\u25A6 All items",i.addEventListener("click",()=>r.onindex()),m.append(i),n.length>1){let s=e.createElement("div");s.className="nr-stepper";let c=(t,v,u)=>{let o=e.createElement("button");return o.type="button",o.dataset.act=v,o.textContent=u,o.disabled=t<0||t>=n.length,o.disabled||o.addEventListener("click",()=>r.onactivate(t)),o},p=e.createElement("span");p.className="nr-pos",p.textContent=g(d,n.length,"Section"),s.append(c(d-1,"prev-section","\u2039 Prev"),p,c(d+1,"next-section","Next \u203A")),m.append(s)}return a.append(m),l.append(a),{destroy(){y(a),a.remove(),N.remove()}}}export{L as mountNarrative,A as sectionsOf};
