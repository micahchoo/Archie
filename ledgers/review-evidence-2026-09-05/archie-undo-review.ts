import { AnnotationSession } from '/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/packages/render-core/src/session/session.ts';
import { AnnotationUndoManager } from '/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/packages/render-core/src/session/undo.ts';
const body=(value:string)=>({type:'TextualBody' as const,value});
{
 const s=new AnnotationSession('alice' as any);const m=new AnnotationUndoManager(s);
 m.createNote({target:'https://example.org/o1',body:body('first action')});
 m.createNote({target:'https://example.org/o1',body:body('second action')});
 m.undo();
 console.log(JSON.stringify({probe:'two-separate-creates-no-marks',shown:m.notes().length,log:s.entries.length,canUndo:m.canUndo}));
}
{
 const s=new AnnotationSession('alice' as any);const id=s.createNote({target:'https://example.org/o1',body:body('original')});const m=new AnnotationUndoManager(s);m.resyncLog();
 m.editNote(id,{body:body('edit1')});m.undo();
 m.editNote(id,{body:body('edit2-after-undo')});
 console.log(JSON.stringify({probe:'edit-after-undo',shown:m.notes()[0]?.body,stored:s.notes()[0]?.body}));
}
{
 const s=new AnnotationSession('alice' as any);const id=s.createNote({target:'https://example.org/o1',body:body('original')});const m=new AnnotationUndoManager(s);m.resyncLog();
 m.deleteNote(id);m.undo();
 try{m.editNote(id,{body:body('edit-after-restored-delete')});console.log({probe:'edit-restored-delete',shown:m.notes()[0]?.body,stored:s.notes()[0]?.body})}catch(e){console.log({probe:'edit-restored-delete',error:String(e)})}
}
