export const W=2520,H=1080;
export const profiles={abilities:{top:486,bottom:822,name:'特殊能力'},data:{top:280,bottom:822,name:'サクセスデータ'}};
export function makeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export function normalize(img){
 const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
 if(w/h<1.55||w/h>3.1||h<360)throw Error('この画像のサイズには未対応です。横向きの能力データ画面を、切り取らずに選んでください。');
 const c=makeCanvas(W,H),g=c.getContext('2d',{willReadFrequently:true}),s=H/h;
 g.drawImage(img,(W-w*s)/2,0,w*s,H);return c;
}
export function pixels(c){return c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;}
export function detectMode(p){
 const scores=[1320,1610,1900].map(x=>{let sum=0;for(let y=233;y<252;y+=3)for(let xx=x-35;xx<x+35;xx+=5){let i=(y*W+xx)*4;sum+=p[i]-p[i+1];}return sum;});
 const i=scores.indexOf(Math.max(...scores));
 if(i===1)throw Error('「冒険者能力」画面にはまだ対応していません。「特殊能力」または「サクセスデータ」の画像を選んでください。');
 return i===0?'abilities':'data';
}
function identityError(a,b){let total=0,n=0;for(let y=320;y<810;y+=13)for(let x=490;x<1100;x+=13){const i=(y*W+x)*4;for(let k=0;k<3;k++)total+=Math.abs(a[i+k]-b[i+k]);n+=3;}return total/n;}
function score(a,b,d,p,step=7){
 let total=0,n=0;
 for(let y=p.top+d+8;y<p.bottom-12;y+=5)for(let x=1190;x<2000;x+=step){
  const i=(y*W+x)*4,j=((y-d)*W+x)*4;
  // Give text and icons more weight than broad, repeating cream backgrounds.
  const edge=Math.abs(a[i]-a[i+4])+Math.abs(a[i+1]-a[i+5])+Math.abs(a[i+2]-a[i+6]);
  const weight=(Math.min(a[i],a[i+1],a[i+2])<140||edge>45)?2:0.25;
  total+=weight*(Math.abs(a[i]-b[j])+Math.abs(a[i+1]-b[j+1])+Math.abs(a[i+2]-b[j+2]))/3;n+=weight;
 }return n?total/n:255;
}
export function chooseSeam(a,b,d,p){
 let best=Infinity,seam=p.bottom-30;
 for(let y=Math.max(p.top+d+18,p.bottom-110);y<p.bottom-16;y++){
  let sum=0;
  for(let x=1185;x<2000;x+=5){let i=(y*W+x)*4,j=((y-d)*W+x)*4;sum+=Math.abs(a[i]-a[i-W*4])+Math.abs(a[i+1]-a[i-W*4+1])+Math.abs(a[i]-b[j]);if(a[i]<120&&a[i+1]<120)sum+=50;}
  if(sum<best){best=sum;seam=y;}
 }return seam;
}
function matchPair(a,b,p){
 let candidates=[];
 for(let order=0;order<2;order++){
  const first=order?b:a,last=order?a:b;let best={score:Infinity};
  for(let d=12;d<p.bottom-p.top-65;d++){const s=score(first,last,d,p,9);if(s<best.score)best={score:s,d};}
  const center=best.d;
  for(let d=Math.max(12,center-3);d<=center+3;d++){const s=score(first,last,d,p,5);if(s<best.score)best={score:s,d};}
  candidates.push({...best,order});
 }
 candidates.sort((x,y)=>x.score-y.score);const best=candidates[0];
 const zero=score(a,b,0,p,9);
 if(zero<3)return {duplicate:true};
 if(best.score>40||best.score>zero*.85)return null;
 const first=best.order?b:a,last=best.order?a:b;
 const seam=chooseSeam(first,last,best.d,p);
 return {...best,seam,confidence:best.score<24?'high':'check',originalD:best.d,originalSeam:seam};
}
export async function analyzeMany(canvases,mode='auto',onProgress=()=>{}){
 const n=canvases.length;
 if(n<2||n>10)throw Error('スクショを2〜10枚選んでください。');
 const data=canvases.map(pixels),ma=mode==='auto'?detectMode(data[0]):mode,p=profiles[ma];
 if(!p)throw Error('画面の種類を選び直してください。');
 for(let i=1;i<n;i++){
  if(identityError(data[0],data[i])>28)throw Error(`画像1と画像${i+1}の冒険者や画面が違う可能性があります。同じ冒険者の画像を選んでください。`);
  if(mode==='auto'&&detectMode(data[i])!==ma)throw Error('画面の種類が違います。同じタブの画像を選んでください。');
 }
 const edges=Array.from({length:n},()=>Array(n).fill(null));let checked=0;
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  const match=matchPair(data[i],data[j],p);
  if(match?.duplicate)throw Error(`画像${i+1}と画像${j+1}は同じ位置の画像のようです。どちらかを削除してください。`);
  if(match){const from=match.order?j:i,to=match.order?i:j;edges[from][to]=match;}
  onProgress(++checked,n*(n-1)/2);await new Promise(r=>setTimeout(r,0));
 }
 // Find a complete top-to-bottom chain; never omit an unmatched screenshot.
 const size=1<<n,cost=Array.from({length:size},()=>Array(n).fill(Infinity)),prev=Array.from({length:size},()=>Array(n).fill(-1));
 for(let i=0;i<n;i++)cost[1<<i][i]=0;
 for(let mask=1;mask<size;mask++)for(let i=0;i<n;i++)if(Number.isFinite(cost[mask][i])){
  for(let j=0;j<n;j++)if(!(mask&(1<<j))&&edges[i][j]){
   const next=mask|(1<<j),value=cost[mask][i]+edges[i][j].score;
   if(value<cost[next][j]){cost[next][j]=value;prev[next][j]=i;}
  }
 }
 let mask=size-1,last=cost[mask].indexOf(Math.min(...cost[mask]));
 if(!Number.isFinite(cost[mask][last]))throw Error('すべての画像をつなぐ重なりが見つかりませんでした。途中のスクショを追加し、隣り合う画像で同じ項目が1〜2段重なるようにしてください。');
 const order=[];
 while(last!==-1){order.unshift(last);const before=prev[mask][last];mask^=1<<last;last=before;}
 const joins=order.slice(1).map((to,i)=>({...edges[order[i]][to]}));
 return {mode:ma,order,joins,confidence:joins.some(j=>j.confidence==='check')?'check':'high'};
}
export function composeMany(canvases,info,scale=1){
 const base=canvases[info.order[0]],total=info.joins.reduce((sum,j)=>sum+j.d,0);
 const c=makeCanvas(1668,945+total),g=c.getContext('2d');g.imageSmoothingEnabled=false;
 g.drawImage(base,427,64,1668,758,0,0,1668,758);
 g.drawImage(base,427,822,1668,1,0,758,1668,total);
 g.drawImage(base,427,822,1668,187,0,758+total,1668,187);
 let offset=0;
 info.joins.forEach((join,i)=>{
  const p=profiles[info.mode],seam=Math.max(p.top+join.d+1,Math.min(p.bottom-1,join.seam));
  g.drawImage(canvases[info.order[i+1]],1163,seam-join.d,883,822-seam+join.d,736,offset+seam-64,883,822-seam+join.d);
  offset+=join.d;
 });
 const start=info.mode==='abilities'?492:286,bg=base.getContext('2d').getImageData(2039,600,1,1).data;
 g.fillStyle=`rgb(${bg[0]},${bg[1]},${bg[2]})`;g.fillRect(2018-427,start-64,21,816-start+total);
 if(scale===1)return c;
 const out=makeCanvas(Math.round(c.width*scale),Math.round(c.height*scale));out.getContext('2d').drawImage(c,0,0,out.width,out.height);return out;
}
