import { MemoryFilesystem } from '/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/packages/render-core/src/fs/memory.ts';
import { AnnotationSession } from '/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/packages/render-core/src/session/session.ts';
import { readAnnotationsReport } from '/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/packages/render-core/src/spine/persist.ts';
import { readStructureReport } from '/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/packages/render-core/src/spine/structure-persist.ts';
const body=(value:string)=>({type:'TextualBody',value});
async function write(dir:any,name:string,data:any){const w=await(await dir.getFile(name,{create:true})).writable(); await w.write(JSON.stringify(data)); await w.close();}
function gated(dir:any){let unblock:any,entered:any; const gate=new Promise<void>(r=>unblock=r), reached=new Promise<void>(r=>entered=r);let once=true; return {reached,unblock:()=>unblock(),dir:{getDirectory:(...a:any[])=>dir.getDirectory(...a),getFile:async(...a:any[])=>{if(once){once=false;entered();await gate;}return dir.getFile(...a)},remove:(...a:any[])=>dir.remove(...a),entries:()=>dir.entries()}};}
for(const full of [true,false]){
 const dir=await new MemoryFilesystem().root();const s=new AnnotationSession('alice' as any);const id=s.createNote({target:'https://img/a.jpg',body:body('v1')});
 if(!full){await s.save(dir);s.editNote(id,{body:body('v2')});}
 const g=gated(dir);const pending=s.save(g.dir);await g.reached;s.editNote(id,{body:body('latest-during-save')});g.unblock();await pending;await s.save(dir);
 const loaded=await AnnotationSession.load(dir,'alice' as any);console.log(JSON.stringify({probe:full?'full-save-race':'incremental-save-race',memory:s.notes()[0].body,disk:loaded.notes()[0].body,memoryVersions:s.entries.length,diskVersions:loaded.entries.length}));
}
{
 const dir=await new MemoryFilesystem().root();const s=new AnnotationSession('alice' as any);const a=s.createNote({target:'https://img/a.jpg',body:body('survivor')}); const b=s.createNote({target:'https://img/a.jpg',body:body('bad')});await s.save(dir);const hist=await dir.getDirectory('history');await write(hist,`${b}.json`,{});
 try{console.log({probe:'wrong-schema-page',result:await readAnnotationsReport(dir)})}catch(e){console.log(JSON.stringify({probe:'wrong-schema-page',thrown:String(e),survivor:a}));}
}
{
 const broken:any={getDirectory:async()=>{throw new DOMException('user revoked folder access','NotAllowedError')}};
 console.log(JSON.stringify({probe:'failed-history-dir',annotations:await readAnnotationsReport(broken),structure:await readStructureReport(broken,'ex' as any)}));
}
