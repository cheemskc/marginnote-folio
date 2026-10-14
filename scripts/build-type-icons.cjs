// Original 24-unit line icons, supersampled into transparent native PNG assets.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
function crc(b) { let v=0xffffffff; for(const byte of b){v^=byte;for(let i=0;i<8;i++)v=(v>>>1)^(v&1?0xedb88320:0);} return (v^0xffffffff)>>>0; }
function chunk(t,d) { const l=Buffer.alloc(4),c=Buffer.alloc(4),b=Buffer.from(t);l.writeUInt32BE(d.length);c.writeUInt32BE(crc(Buffer.concat([b,d])));return Buffer.concat([l,b,d,c]); }
const paper=[[6,3,15,3],[15,3,19,7],[19,7,19,21],[19,21,6,21],[6,21,6,3],[15,3,15,7],[15,7,19,7]];
const line=(x,y,w)=>[x,y,x+w,y];
const starPoints=Array.from({length:10},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/5,r=i%2?4:9;return [12+Math.cos(angle)*r,12+Math.sin(angle)*r];});
const star=starPoints.map((point,i)=>[...point,...starPoints[(i+1)%starPoints.length]]);
function insideStar(x,y){let inside=false;for(let i=0,j=starPoints.length-1;i<starPoints.length;j=i++){
 const a=starPoints[i],b=starPoints[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
}return inside;}
const shapes={
 'unknown':paper,
 'journal-article':[...paper,line(9,10,6),line(9,14,7),line(9,17,5)],
 'thesis':[[2,8,12,4],[12,4,22,8],[22,8,12,12],[12,12,2,8],[6,10,6,16],[6,16,12,19],[12,19,18,16],[18,16,18,10],[22,8,22,16]],
 'patent':[[9,17,15,17],line(9,20,6),line(10,22,4),[9,17,8,13],[15,17,16,13]],
 'conference-paper':[[3,4,21,4],[21,4,21,15],[21,15,3,15],[3,15,3,4],[12,15,12,20],[12,20,7,23],[12,20,17,23],line(7,8,10),line(7,11,6)],
 'book':[[3,4,10,4],[10,4,12,6],[12,6,14,4],[14,4,21,4],[21,4,21,20],[21,20,14,20],[14,20,12,22],[12,22,10,20],[10,20,3,20],[3,20,3,4],[12,6,12,22]],
 'report':[...paper,[9,17,9,13],[12,17,12,10],[15,17,15,12]],
 'preprint':[...paper,line(9,11,7),[9,17,16,17],[16,17,14,15],[16,17,14,19]],
 'star':star,
 'star-filled':star,
 'folder':[[2,6,9,6],[9,6,11,8],[11,8,21,8],[21,8,21,19],[21,19,2,19],[2,19,2,6]],
 'folder-open':[[2,9,21,9],[21,9,18,19],[18,19,3,19],[3,19,2,9],[2,9,7,9],[7,9,9,6],[9,6,16,6]],
 'chevron-right':[[9,6,15,12],[15,12,9,18]],
 'chevron-down':[[6,9,12,15],[12,15,18,9]],
};
function distance(x,y,s){const [a,b,c,d]=s,dx=c-a,dy=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a-t*dx,y-b-t*dy);}
for(const [type,segments] of Object.entries(shapes)){
 const size=72,raw=Buffer.alloc(size*(1+size*4)),rgb=type==='star-filled'?[209,160,40]:type==='patent'?[196,133,25]:[99,122,140];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let hits=0;
  for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
   const px=(x+(sx+.5)/2)/3,py=(y+(sy+.5)/2)/3;
   let hit=segments.some(s=>distance(px,py,s)<.75);
   if(type==='star-filled')hit=hit||insideStar(px,py);
   if(type==='patent' && py<=13.7)hit=hit||Math.abs(Math.hypot(px-12,py-8)-5.5)<.75;
   if(hit)hits++;
  }
  const o=y*(1+size*4)+1+x*4;rgb.forEach((v,i)=>raw[o+i]=v);raw[o+3]=Math.round(hits/4*255);
 }
 const h=Buffer.alloc(13);h.writeUInt32BE(size);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;
 fs.writeFileSync(path.join(__dirname,'../src/type-'+type+'.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
