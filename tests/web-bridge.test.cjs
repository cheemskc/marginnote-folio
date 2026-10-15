const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function host(){
 let saved=[],opened=[],stopped=false;
 const journal={easyScholar:true,openAlex:true,easyScholarKey:'private-es',openAlexKey:'private-oa'};
 const paper={autoLookup:false,autoLibrary:false,crossref:true,openAlex:true,overwrite:false};
 const doc={id:'a',title:'Paper',doi:'10.1/test',venue:'Journal',abstract:'',metrics:{}};
 const c={addon:{},mnplGeneration:0};
 const context=vm.createContext({Promise,console,
  MNPLJournal:{settings:()=>({...journal}),saveSettings:p=>Object.assign(journal,p),lookup:async()=>({journal:{jcrQuartile:'Q1'},warnings:[]})},
  MNPLPaperData:{settings:()=>({...paper}),saveSettings:p=>Object.assign(paper,p),lookup:async()=>({title:'Paper',abstract:'Verified abstract',metrics:{source:'Crossref'}}),merge:(_,f)=>f},
  MNPLService:{inScope:id=>id==='a',record:()=>({...doc}),detail:()=>({...doc}),saveMetadata:(_,p)=>{saved.push(p);return {...doc,...p.metadata};},open:()=>({requested:true}),currentDocument:()=>({...doc})},
  MNPLRelations:{get:()=>({}),load:async()=>({items:[],total:0})},
  MNPLBatchLookup:{start:(_,hooks)=>({current:0,total:1,stop(){stopped=true;hooks.done({stopped:true});}})},
  MNPLPanel:{close:()=>{}},Application:{sharedInstance:()=>({openURL:u=>opened.push(u)})},NSURL:{URLWithString:s=>s}
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/WebBridgeCommands.js'),'utf8'),context);
 return {commands:context.MNPLWebBridgeCommands.commands,c,journal,paper,saved,opened,context,stopped:()=>stopped};
}
test('web settings expose configured flags without returning saved credentials',()=>{
 const h=host(),r=h.commands.getSettings(h.c);
 assert.equal(r.journal.easyScholarConfigured,true);assert.equal(r.journal.openAlexConfigured,true);
 assert.ok(!JSON.stringify(r).includes('private-'));
 h.commands.saveSettings(h.c,{journal:{easyScholarKey:'replacement'},paper:{crossref:false,unknown:true}});
 assert.equal(h.journal.easyScholarKey,'replacement');assert.equal(h.paper.crossref,false);assert.equal(h.paper.unknown,undefined);
});
test('web queries reject out-of-library documents and unsafe external navigation',()=>{
 const h=host();assert.throws(()=>h.commands.getDocument(h.c,{id:'outside'}));
 assert.throws(()=>h.commands.openSource(h.c,{url:'javascript:alert(1)'}));
 h.commands.openSource(h.c,{url:'https://doi.org/10.1/test'});assert.equal(h.opened.length,1);
});
test('abstract-only recognition writes only the abstract and provenance',async()=>{
 const h=host();const r=await h.commands.lookupPaper(h.c,{id:'a',abstractOnly:true});
 assert.equal(r.document.abstract,'Verified abstract');assert.equal(h.saved[0].metadata.title,undefined);
 assert.equal(h.saved[0].metadata.metrics.abstractSource,'Crossref');
});
test('closing a generation prevents in-flight recognition from saving',async()=>{
 const h=host();const work=h.commands.lookupPaper(h.c,{id:'a'});h.c.mnplGeneration++;
 await assert.rejects(work,/取消/);assert.equal(h.saved.length,0);
});
test('web stop button terminates the native batch and returns stopped status',()=>{
 const h=host();h.commands.startBatch(h.c);const result=h.commands.stopBatch(h.c);
 assert.equal(h.stopped(),true);assert.equal(result.running,false);assert.equal(result.stopped,true);
});
