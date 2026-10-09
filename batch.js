import {normalize,makeCanvas} from './core.js?v=20261008-local';
export const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
export function release(canvas){if(canvas){canvas.width=1;canvas.height=1;}}
export function canvasBlob(canvas,type='image/png',quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('画像を保存用に変換できませんでした。')),type,quality));}
export async function readCanvas(file){
 if(file.size>20*1024*1024)throw Error('1枚20MB以下の画像を選んでください。');
 if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('PNG・JPEG・WebPの画像を選んでください。');
 const url=URL.createObjectURL(file),img=new Image();
 try{img.src=url;await img.decode();if(img.naturalWidth*img.naturalHeight>24000000)throw Error('2400万画素以下のスクショを選んでください。');return {canvas:normalize(img),width:img.naturalWidth,height:img.naturalHeight};}
 finally{img.src='';URL.revokeObjectURL(url);}
}
async function withImage(blob,fn){
 const url=URL.createObjectURL(blob),img=new Image();
 try{img.src=url;await img.decode();return await fn(img);}finally{img.src='';URL.revokeObjectURL(url);}
}
// Copy only the photographed content. Party mode never aligns or joins lists.
export async function readPartyShot(file){
 if(file.size>20*1024*1024||!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('20MB以下のPNG・JPEG・WebPを選んでください。');
 return withImage(file,async img=>{
  const w=img.naturalWidth,h=img.naturalHeight;if(w*h>24000000)throw Error('2400万画素以下の画像を選んでください。');
  const full=w/h>1.55;let x=0,y=0,width=w,height=h;
  if(full){const scale=h/1080;x=Math.round((427-1260)*scale+w/2);y=Math.round(64*scale);width=Math.round(1668*scale);height=Math.round(945*scale);}
  if(x<0||y<0||x+width>w||y+height>h)throw Error('能力データ枠を切り取れません。ゲームの横向きスクショを選んでください。');
  const canvas=makeCanvas(width,height);
  try{canvas.getContext('2d').drawImage(img,x,y,width,height,0,0,width,height);return {blob:await canvasBlob(canvas),width,height,full};}finally{release(canvas);}
 });
}
export function sheetLayout(results,options={}){
 const sizes=results.map((r,i)=>({slot:r.slot||i+1,width:r.width,height:r.height}));
 const cols=2,margin=24,gap=24,heading=0,cellWidth=Math.max(...results.map(r=>r.width)),headerHeight=176;
 const heights=[320,320,320];sizes.forEach(r=>{const row=Math.floor((r.slot-1)/2);heights[row]=Math.max(heights[row],r.height+heading);});
 const width=margin*2+cellWidth*2+gap,height=margin*2+headerHeight+gap+heights.reduce((a,b)=>a+b,0)+gap*2;
 if(width*height>64000000||width>16384||height>16384)throw Error('シートが大きすぎます。解像度を抑えて撮影したスクショを使用してください。');
 return {cols,margin,gap,cellWidth,heading,heights,headerHeight,width,height,sizes};
}
export async function composeSheet(results,options={},check=()=>{}){
 if(!results.length)throw Error('シートに含めるキャラを1人以上選んでください。');
 const l=sheetLayout(results,options),canvas=makeCanvas(l.width,l.height),g=canvas.getContext('2d');
 try{
  g.fillStyle='#101622';g.fillRect(0,0,l.width,l.height);
  const noteX=l.margin,noteWidth=l.width-l.margin*2;g.fillStyle='#192231';g.fillRect(noteX,l.margin,noteWidth,l.headerHeight);
  g.fillStyle='#f4f7fb';const notes=(options.notes||[]).slice(0,2);
  notes.forEach((text,i)=>{let size=48;do{g.font=`500 ${size}px system-ui,sans-serif`;if(g.measureText(text).width<=noteWidth-64)break;size--;}while(size>8);g.fillText(text,noteX+32,l.margin+64+i*64);});
  for(let slot=1;slot<=6;slot++){
   check();const r=results.find((r,i)=>(r.slot||i+1)===slot),row=Math.floor((slot-1)/2),x=l.margin+((slot-1)%2)*(l.cellWidth+l.gap),y=l.margin+l.headerHeight+l.gap+l.heights.slice(0,row).reduce((a,b)=>a+b+l.gap,0);
   g.fillStyle='#fff4df';g.fillRect(x,y,l.cellWidth,l.heights[row]);
   if(r)await withImage(r.blob,img=>{check();const size=l.sizes.find(s=>s.slot===slot);g.drawImage(img,x+Math.floor((l.cellWidth-size.width)/2),y+l.heading);});
   await pause();
  }
  return canvas;
 }catch(e){release(canvas);throw e;}
}
