import { Window } from '/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/packages/archie-viewer/node_modules/happy-dom/lib/index.js';
const win=new Window({url:'https://host.test/article/'});
for(const name of ['window','document','HTMLElement','customElements','Node','ShadowRoot','Element','navigator','DOMParser','XMLSerializer','HTMLCanvasElement','HTMLImageElement','Image','requestAnimationFrame','cancelAnimationFrame']) Object.defineProperty(globalThis,name,{value: name==='window'?win:win[name],configurable:true});
const m=await import('./archie-reader-bundle.mjs');
const ann={id:'https://lib.test/e/annotations/n1/v1',type:'Annotation','archie:logicalId':'n1',target:'https://lib.test/e/canvas/o1',body:{type:'TextualBody',purpose:'commenting',value:'Reading exclusive zebra'}};
const ex={slug:'e',title:'Exhibit',objects:[{id:'o1',label:'Audio',source:'data:audio/wav;base64,',mediaType:'sound',duration:60}],annotationsByObject:{o1:[]},readingAnnotationsByObject:{o1:{cipher:[ann]}},readings:[{id:'cipher',label:'Cipher',color:'#abcdef'}],sections:[{id:'s1',title:'Opening',objectId:'o1',prose:'Specific authored section'}],canvasIdByObject:{o1:'https://lib.test/e/canvas/o1'}};
console.log('reading-only note target:',m.resolveExhibitTarget(ex,{view:'exhibit',slug:'e',noteId:'n1'}));
console.log('search finds hidden reading note:',m.searchExhibit(ex,'zebra'));
const layer=m.createReadingLayer({exhibit:ex,onRepaint(){},onRebuild(){}});layer.setObject('o1');console.log('but current surface has IDs:',layer.notes().map(a=>a.id));
console.log('section target:',m.resolveExhibitTarget(ex,{view:'exhibit',slug:'e',sectionId:'s1'}));
const fs=new m.MemoryFilesystem();
await m.publishLibrary(fs,{id:'L',title:'Library',exhibits:[{id:'e',slug:'e',title:'Exhibit',objects:ex.objects}]},()=>[],{baseUrl:'https://lib.test/'});
const root=await fs.root();const ej=await root.getFile('exhibits.json');const gallery=JSON.parse(await new Response(await ej.readable()).text());gallery.exhibits[0].cover='https://tracker.test/pixel.png';await ej.writable().then(async w=>{await w.write(JSON.stringify(gallery));await w.close();});
m.defineArchieViewer();const el=document.createElement('archie-viewer');el.offline=true;document.body.append(el);await el.openLibraryFs(fs);console.log('offline gallery remote images:',[...el.shadowRoot.querySelectorAll('img')].map(n=>n.src));
const host=document.createElement('div');document.body.append(host);const card=m.createNoteCard(host);card.showNote([{...ann,body:{type:'TextualBody',purpose:'commenting',value:'![Photo](https://tracker.test/note.png)'}}],ann.id);console.log('note card remote images (no offline option available):',[...host.querySelectorAll('img')].map(n=>n.src));card.destroy();
const host2=document.createElement('div');document.body.append(host2);const whole={...ann,id:'whole',body:{type:'TextualBody',purpose:'commenting',value:'Whole recording body'}};const av=m.mountAvPlayer(host2,{object:ex.objects[0],annotations:[whole],initialSelect:'whole'});host2.querySelector('audio').dispatchEvent(new win.Event('loadedmetadata'));console.log('uncued initialSelect card hidden:',host2.querySelector('.archie-note-card')?.hidden);av.destroy();

const nfs=await import('node:fs/promises');const base='/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/apps/viewer/public/published/';
const source={get:async p=>JSON.parse(await nfs.readFile(base+p,'utf8')),getOptional:async p=>{try{return JSON.parse(await nfs.readFile(base+p,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}};
const real=await m.readExhibitTree(source,'voynich');let readingExample;
for(const o of real.objects){for(const [rid,ns]of Object.entries(real.readingAnnotationsByObject[o.id]??{})){const n=ns.find(n=>!(real.annotationsByObject[o.id]??[]).some(b=>b.id===n.id));if(n){readingExample={o,rid,n};break}}if(readingExample)break;}
if(readingExample){const {o,rid,n}=readingExample;console.log('real fixture reading-only note:',{object:o.id,reading:rid,id:n.id,logicalId:n['archie:logicalId'],resolution:m.resolveExhibitTarget(real,{view:'exhibit',slug:'voynich',noteId:n['archie:logicalId']??n.id})});}

el.target = "#/e/o/o1"; el.target = "#/";
await new Promise(r=>setTimeout(r,40));
console.log("latest gallery target race:",{target:el.target,renderedReader:!!el.shadowRoot.querySelector(".reader"),renderedTitle:el.shadowRoot.querySelector(".topbar .title")?.textContent});
el.remove();
await win.happyDOM.abort();
