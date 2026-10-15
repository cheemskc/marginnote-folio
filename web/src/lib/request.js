import {MNBridge} from './mnBridge.js';
// Explicit browser preview fixtures. Production always calls the native bridge.
const docs=import.meta.env.DEV?[
 {id:'a',title:'Influences of ultrasonic vibration directions, amplitudes, and frequencies on sapphire polishing studied by molecular dynamics',authors:'Wenhu Xu, Cheng Huang, Xianghong Liu',year:'2024',venue:'Precision Engineering',folderPath:'超声加工/蓝宝石',itemType:'journal-article',journal:{jcrQuartile:'Q1',impactFactor:7.6},doi:'10.1016/j.precisioneng.2024.09.013',abstract:'This study investigates the effects of ultrasonic vibration on sapphire polishing. Molecular dynamics simulations are used to compare material removal and subsurface deformation.',metrics:{publisher:'Elsevier',type:'journal-article',source:'Crossref',citations:12,references:42}},
 {id:'b',title:'超声辅助加工材料去除机理与表面质量研究',authors:'王中旺',year:'2026',venue:'大连理工大学',folderPath:'超声加工',itemType:'thesis',journal:{},metrics:{type:'thesis'}},
 ...Array.from({length:16},(_,i)=>({id:'d'+i,title:['Effect of hydroxylation of surface on atomic level removal for sapphire during polishing','Wear state monitoring of ceramic-bonded diamond grinding wheels during ultra-precision grinding of sapphire A-plane','Mechanism of ultrasonic vibration-assisted solid-state processing'][i%3],authors:'Sicheng Zhang, Min Zhong, Wenhu Xu',year:String(2026-i%6),venue:'Tribology International',folderPath:i%2?'超声加工/蓝宝石':'超声加工/硅',itemType:'journal-article',journal:{jcrQuartile:'Q1',impactFactor:7.6},metrics:{type:'journal-article'}}))
]:[];
let root='超声加工';const config={paper:{autoLookup:false,autoLibrary:false,crossref:true,openAlex:true,overwrite:false},journal:{easyScholar:true,openAlex:true,easyScholarConfigured:true,openAlexConfigured:false},batch:null};
const folders=()=>({rootPath:root,rootExists:true,warnings:[],folders:['','超声加工','超声加工/蓝宝石','超声加工/硅'].map(p=>({path:p,name:p.split('/').pop()||'全部文献',parentPath:p?p.split('/').slice(0,-1).join('/'):null,count:docs.filter(d=>!p||d.folderPath===p||d.folderPath.startsWith(p+'/')).length}))});
export async function request(command,payload={}){
 if(!import.meta.env.DEV)return MNBridge.send(command,payload);
 if(command==='getFolders')return folders();
 if(command==='setRootFolder'){root=payload.path;return folders();}
 if(command==='listDocuments'){let rows=docs.filter(d=>(!payload.folderPath||d.folderPath.startsWith(payload.folderPath))&&(!payload.favoritesOnly||d.favorite)&&(!payload.itemTypes?.length||payload.itemTypes.includes(d.itemType))&&[d.title,d.authors,d.venue].join(' ').toLowerCase().includes((payload.query||'').toLowerCase()));return {items:rows.slice(payload.offset||0,(payload.offset||0)+(payload.limit||80)),total:rows.length};}
 if(command==='getCurrentDocument')return docs[0];
 if(command==='getDocument')return docs.find(d=>d.id===payload.id);
 if(command==='saveMetadata'||command==='setFavorite'){const d=docs.find(d=>d.id===payload.id);Object.assign(d,command==='saveMetadata'?payload.metadata:{favorite:payload.favorite});return {...d};}
 if(command==='getSettings')return {...config};
 if(command==='saveSettings'){if(payload.paper)Object.assign(config.paper,payload.paper);if(payload.journal){for(const k of ['easyScholar','openAlex'])if(k in payload.journal)config.journal[k]=payload.journal[k];for(const k of ['easyScholar','openAlex'])if(k+'Key' in payload.journal)config.journal[k+'Configured']=!!payload.journal[k+'Key'];}return {...config};}
 if(command==='getRelations')return {};
 if(command==='loadRelations')return {items:[{id:'r',title:'Ultrasonic vibration assisted polishing of sapphire substrates',authors:'W. Xu, C. Huang',year:'2023',venue:'Precision Engineering',url:'https://doi.org/10.1016/j.precisioneng.2024.09.013'}],total:42,hasMore:false};
 if(command==='lookupPaper'||command==='lookupJournal')return {document:docs.find(d=>d.id===payload.id),message:'预览：实际数据由 MarginNote 查询。'};
 if(command==='getBatch')return config.batch;
 if(command==='startBatch')return config.batch={running:true,total:18,current:0,saved:0};
 if(command==='stopBatch')return config.batch={...config.batch,running:false,stopped:true};
 return {};
}
