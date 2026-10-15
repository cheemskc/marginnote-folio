import React from 'react';
export const TYPES=[['journal-article','期刊论文'],['conference-paper','会议论文'],['thesis','学位论文'],['patent','专利'],['book','图书 / 章节'],['report','报告'],['preprint','预印本'],['unknown','未识别类型']];
export const SORTS=[['year-desc','年份 ↓'],['year-asc','年份 ↑'],['title-asc','标题 A–Z'],['title-desc','标题 Z–A'],['author-asc','作者'],['venue-asc','期刊 / 来源'],['quartile-asc','JCR 分区'],['if-desc','影响因子 ↓']];
export function Icon({name,className=''}){
 const shapes={search:<><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></>,filter:<path d="M3 4h18l-7 8v7l-4 2v-9z"/>,sort:<><path d="M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4"/></>,star:<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>,open:<><path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6"/></>,folder:<path d="M3 6h7l2 2h9v12H3z"/>,chevron:<path d="m9 5 7 7-7 7"/>,close:<path d="m5 5 14 14M5 19 19 5"/>,sidebar:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/></>,refresh:<><path d="M20 10a8 8 0 1 0-2 8M20 3v7h-7"/></>,file:<><path d="M5 3h9l5 5v13H5zM14 3v5h5M8 12h8M8 16h6"/></>,thesis:<><path d="m2 9 10-5 10 5-10 5zM6 11v6c4 3 8 3 12 0v-6M22 9v8"/></>,patent:<><path d="M9 18h6m-6 3h6M8 14a7 7 0 1 1 8 0l-1 2H9z"/></>,book:<><path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1v15"/></>};
 return <svg className={'icon '+className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.file}</svg>;
}
export function Badges({journal={}}){return <span className="badges">{journal.jcrQuartile&&<span className="badge">JCR {journal.year&&journal.year+' '}{journal.jcrQuartile}</span>}{journal.impactFactor!=null&&<span className="badge factor">IF {journal.impactFactor}</span>}{journal.casQuartile&&<span className="badge" title={journal.casQuartile}>中科院 {journal.casQuartile}</span>}{journal.rankLabel&&<span className="badge" title={journal.rankLabel}>{journal.rankLabel}</span>}{journal.openAlexCitedness!=null&&<span className="badge">OpenAlex {journal.openAlexCitedness}</span>}</span>;}
export default function PaperRow({item,selected,onSelect,onOpen,onFavorite,savingFavorite}){
 const type=item.itemType||'unknown',name=TYPES.find(x=>x[0]===type)?.[1]||'文献';
 return <article className={'paper-row'+(selected?' selected':'')} data-paper-id={item.id}>
  <button className="row-select" onClick={()=>onSelect(item.id)} onDoubleClick={()=>onOpen(item.id)} aria-label={'查看：'+item.title} aria-pressed={selected}>
   <span className={'type-icon '+type} title={name}><Icon name={['patent','thesis','book'].includes(type)?type:'file'}/></span>
   <span className="row-main"><span className="row-heading"><strong title={item.title}>{item.title}</strong><Badges journal={item.journal}/></span><span className="row-authors">{item.authors||'作者待补充'}</span><span className="row-meta">{item.year||'年份 —'}<span>·</span><span title={item.venue}>{item.venue||'来源待补充'}</span></span></span>
  </button>
  <div className="row-actions"><button title={item.favorite?'取消星标':'添加星标'} aria-label={(item.favorite?'取消星标：':'星标：')+item.title} aria-pressed={!!item.favorite} disabled={savingFavorite} className={'star-button'+(item.favorite?' marked':'')} onClick={()=>onFavorite(item)}><Icon name="star"/></button><button className="row-open" onClick={()=>onOpen(item.id)}>打开<Icon name="open"/></button></div>
 </article>;
}
