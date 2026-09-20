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
 if(i===1)throw Error('「冒険者能力」画面にはまだ対応していません。「特殊能力」または「サクセスデータ」の2枚を選んでください。');
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
export function analyze(canvases,mode='auto'){
 const [a,b]=canvases.map(pixels);
 if(identityError(a,b)>28)throw Error('冒険者や画面が違う可能性があります。同じ冒険者・同じタブの、スクロール前後の2枚を選んでください。');
 const ma=mode==='auto'?detectMode(a):mode,mb=mode==='auto'?detectMode(b):mode;
 if(ma!==mb)throw Error('画面の種類が違います。同じタブの2枚を選んでください。');
 const p=profiles[ma];if(!p)throw Error('画面の種類を選び直してください。');
 let candidates=[];
 for(let order=0;order<2;order++){
  const first=order?b:a,last=order?a:b;let best={score:Infinity};
  for(let d=24;d<p.bottom-p.top-65;d+=3){const s=score(first,last,d,p,9);if(s<best.score)best={score:s,d};}
  const center=best.d;
  for(let d=Math.max(12,center-3);d<=center+3;d++){const s=score(first,last,d,p,5);if(s<best.score)best={score:s,d};}
  candidates.push({...best,order});
 }
 candidates.sort((x,y)=>x.score-y.score);const best=candidates[0];
 const zero=score(a,b,0,p,9);
 if(zero<3)throw Error('同じ位置の画像のようです。2枚目を下へスクロールして撮影してください。');
 if(best.score>40||best.score>zero*.85)throw Error('重なりを十分に見つけられませんでした。同じ項目が1〜2段重なるように撮影してください。');
 const first=best.order?b:a,last=best.order?a:b;
 return {...best,mode:ma,seam:chooseSeam(first,last,best.d,p),confidence:best.score<24?'high':'check',originalD:best.d};
}
export function compose(canvases,info,scale=1){
 const base=canvases[info.order],next=canvases[1-info.order],p=profiles[info.mode],d=info.d;
 const seam=Math.max(p.top+d+1,Math.min(p.bottom-1,info.seam));
 const c=makeCanvas(1668,945+d),g=c.getContext('2d');g.imageSmoothingEnabled=false;
 // Copy the original dialog without re-rendering any labels, numbers, or icons.
 g.drawImage(base,427,64,1668,758,0,0,1668,758);
 g.drawImage(base,427,822,1668,1,0,758,1668,d);
 g.drawImage(base,427,822,1668,187,0,758+d,1668,187);
 g.drawImage(next,1163,seam-d,883,822-seam+d,736,seam-64,883,822-seam+d);
 // A complete list needs no scroll thumb. Use the original adjoining gutter.
 const start=info.mode==='abilities'?492:286;
 const bg=base.getContext('2d').getImageData(2039,600,1,1).data;
 g.fillStyle=`rgb(${bg[0]},${bg[1]},${bg[2]})`;g.fillRect(2018-427,start-64,21,816-start+d);
 if(scale===1)return c;
 const out=makeCanvas(Math.round(c.width*scale),Math.round(c.height*scale));out.getContext('2d').drawImage(c,0,0,out.width,out.height);return out;
}
