import {useEffect,useRef,useState} from 'react';
import {request} from './lib/request.js';
import {Badges,TYPES,Icon} from './PaperRow.jsx';
const FIELDS=[['title','文献库标题'],['authors','作者'],['year','年份'],['venue','期刊 / 来源'],['doi','DOI'],['abstract','摘要']];
const METRICS=[['publisher','出版方'],['volume','卷'],['issue','期'],['pages','页码'],['issn','ISSN'],['language','语言'],['url','来源链接']];
export default function DetailPanel({document:doc,currentId,onSave,onUpdated,onOpen,onNotice,settings,editing,onEditing}){
 const [tab,setTab]=useState('info'),[draft,setDraft]=useState({}),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const [kind,setKind]=useState('references'),[relations,setRelations]=useState({}),[relationBusy,setRelationBusy]=useState(false);
 const generation=useRef(0),attempted=useRef(new Set());
 useEffect(()=>{const g=++generation.current;setRelationBusy(false);setRelations({});setError('');setBusy('');setTab('info');if(doc)request('getRelations',{id:doc.id}).then(r=>{if(g===generation.current)setRelations(r||{});}).catch(()=>{});},[doc?.id]);
 async function lookup(command,extra={}){
  if(!doc||busy)return;const id=doc.id,g=++generation.current;setBusy(command+(extra.abstractOnly?'-abstract':''));setError('');
  try{const result=await request(command,{id,...extra});if(g!==generation.current)return;onUpdated(result.document);onNotice(result.message);}
  catch(e){if(g===generation.current)setError(e.message||'获取失败，请重试。');}finally{if(g===generation.current)setBusy('');}
 }
 useEffect(()=>{if(doc&&settings?.paper.autoLookup&&!doc.metrics?.source&&!attempted.current.has(doc.id)){attempted.current.add(doc.id);lookup('lookupPaper');}},[doc?.id,settings?.paper.autoLookup]);
 function edit(){setDraft({...doc,metrics:{...doc.metrics}});onEditing(true);setError('');}
 async function save(e){e.preventDefault();setBusy('save');setError('');try{const patch={};FIELDS.forEach(([k])=>patch[k]=draft[k]||'');patch.metrics={};METRICS.forEach(([k])=>patch.metrics[k]=draft.metrics?.[k]||'');patch.metrics.type=draft.metrics?.type||'unknown';await onSave(doc.id,patch);onEditing(false);}catch(e){setError(e.message||'保存失败，草稿已保留。');}finally{setBusy('');}}
 async function load(append=false){if(relationBusy)return;const id=doc.id,g=generation.current;setRelationBusy(true);setError('');try{const result=await request('loadRelations',{id,kind,append});if(g===generation.current)setRelations(old=>({...old,[kind]:result}));}catch(e){if(g===generation.current)setError(e.message||'读取失败。');}finally{if(g===generation.current)setRelationBusy(false);}}
 if(!doc)return <div className="detail-empty"><Icon name="file"/><p>选择一篇文献，查看详情</p></div>;
 const data=relations[kind]||{},metrics=doc.metrics||{},date=metrics.updatedAt?new Date(metrics.updatedAt).toLocaleString('zh-CN'):'';
 return <>
  <div className="detail-tabs" role="tablist" aria-label="文献详情">{[['info','文献信息'],['citations','参考文献与引文']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} disabled={editing} onClick={()=>{setTab(id);setError('');}}>{label}</button>)}</div>
  <div className="detail-scroll">
   <div className="detail-heading"><p>{doc.venue||'来源待补充'}{doc.year&&' · '+doc.year}</p><h2>{doc.title}</h2>{doc.id===currentId&&<span className="current-label">当前阅读</span>}<Badges journal={doc.journal}/></div>
   {error&&<div className="error-message" role="alert">{error}</div>}
   {editing?<form id="metadata-form" onSubmit={save} className="edit-form">{FIELDS.map(([key,label])=><label key={key}>{label}{['abstract','title','authors'].includes(key)?<textarea rows={key==='abstract'?7:2} value={draft[key]||''} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>:<input value={draft[key]||''} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>}</label>)}<label>文献类型<select value={draft.metrics?.type||'unknown'} onChange={e=>setDraft({...draft,metrics:{...draft.metrics,type:e.target.value}})}>{TYPES.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>{METRICS.map(([key,label])=><label key={key}>{label}<input value={draft.metrics?.[key]||''} onChange={e=>setDraft({...draft,metrics:{...draft.metrics,[key]:e.target.value}})}/></label>)}</form>
   :tab==='info'?<>
    <dl className="fields"><div><dt>作者</dt><dd>{doc.authors||'作者待补充'}</dd></div></dl>
    <section className="abstract"><div className="section-heading"><h3>摘要</h3><button disabled={!!busy} onClick={()=>lookup('lookupPaper',{abstractOnly:true})}>{busy==='lookupPaper-abstract'?'获取中…':'获取摘要'}</button></div><p className={!doc.abstract?'muted':''}>{doc.abstract||'尚未获取摘要'}</p>{metrics.abstractSource&&<small>摘要来源：{metrics.abstractSource}</small>}</section>
    <dl className="fields"><div><dt>文献类型</dt><dd>{TYPES.find(x=>x[0]===metrics.type)?.[1]||'未识别类型'}</dd></div>{[['doi','DOI'],...METRICS].map(([k,label])=>{const value=k==='doi'?doc.doi:metrics[k];return value?<div key={k}><dt>{label}</dt><dd>{k==='url'?<button className="text-link" onClick={()=>request('openSource',{url:value}).catch(e=>onNotice(e.message))}>打开来源<Icon name="open"/></button>:value}</dd></div>:null;})}{metrics.source&&<div><dt>资料来源</dt><dd>{metrics.source}{date&&<small>{date}</small>}</dd></div>}</dl>
    <div className="detail-tools"><button disabled={!!busy} onClick={()=>lookup('lookupPaper')}>{busy==='lookupPaper'?'识别中…':'识别并补全文献信息'}</button><button disabled={!!busy} onClick={()=>lookup('lookupJournal')}>{busy==='lookupJournal'?'查询中…':'获取期刊标签'}</button></div>
   </>:<section className="relations"><div className="relation-switch">{[['references','参考文献',metrics.references],['citations','引文',metrics.citations]].map(([k,label,n])=><button key={k} className={kind===k?'active':''} onClick={()=>{setKind(k);setError('');}}>{label}<span>{relations[k]?.total??n??'—'}</span></button>)}</div><div className="section-heading"><p>{data.items?.length?'已显示 '+data.items.length+' 篇':'读取具体文献列表与来源'}</p><button disabled={relationBusy} onClick={()=>load(false)}>{relationBusy?'读取中…':data.items?'刷新':'获取列表'}</button></div>{data.items?.map((item,i)=><article className="relation-row" key={item.id||i}><h3>{item.title}</h3><p>{item.authors||'作者未提供'}</p><p>{[item.year,item.venue].filter(Boolean).join(' · ')}</p><button onClick={()=>request('openSource',{url:item.url}).catch(e=>onNotice(e.message))}>打开来源<Icon name="open"/></button></article>)}{(data.cursor||data.hasMore)&&<button className="load-more" disabled={relationBusy} onClick={()=>load(true)}>加载更多</button>}{data.items?.length===0&&<p className="muted">数据源未收录这类关联文献。</p>}<p className="source-note">列表来自 OpenAlex，覆盖范围和更新日期可能与出版商不同。</p></section>}
  </div>
  <div className="detail-footer">{editing?<><button disabled={!!busy} onClick={()=>{onEditing(false);setError('');}}>取消</button><button className="primary" type="submit" form="metadata-form" disabled={!!busy}>{busy==='save'?'保存中…':'保存修改'}</button></>:<><button onClick={edit}>编辑</button><button className="primary" onClick={()=>onOpen(doc.id)}>打开文献<Icon name="open"/></button></>}</div>
 </>;
}
