import {normalize,analyzeMany,composeMany,profiles} from './core.js?v=20260921-1';
const $=id=>document.getElementById(id);
let images=[],info=null,resultBlob=null,resultURL=null,busy=false,revision=0,sharing=false;
function status(text,type=''){ $('status').textContent=text;$('status').className='status '+type; }
function clearResult(){revision++;info=null;resultBlob=null;if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;$('preview').removeAttribute('src');$('download').removeAttribute('href');$('share-status').textContent='';$('preview-wrap').hidden=true;$('save-area').hidden=true;$('adjust').hidden=true;$('empty').hidden=false;$('dimensions').textContent='PNG';}
function setBusy(b){busy=b;document.body.classList.toggle('busy',b);$('combine').disabled=b||images.length<2;$('files').disabled=b;$('mode').disabled=b;$('clear-images').disabled=b;document.querySelectorAll('.remove-image').forEach(el=>el.disabled=b);}
function selectionStatus(){status(images.length>=2?`${images.length}枚を選択しました。「1枚につなぐ」を押してください。`:images.length?'もう1枚以上のスクショを追加してください。':'同じ項目が1〜2段重なるスクショを、2枚以上選んでください。');}
function showImages(){
 $('selected-images').replaceChildren();$('clear-images').hidden=images.length===0;$('image-count').textContent=`${images.length} / 10枚`;$('file-label').textContent=images.length?'画像を追加する':'スクショをまとめて選ぶ';
 images.forEach((item,index)=>{
  const card=document.createElement('div'),img=document.createElement('img'),name=document.createElement('p'),remove=document.createElement('button');
  card.className='input-item';img.src=item.url;img.width=item.width;img.height=item.height;img.alt=`選択した画像${index+1}`;name.textContent=`${index+1}. ${item.name}`;name.title=item.name;
  remove.type='button';remove.className='remove-image';remove.textContent='削除';remove.setAttribute('aria-label',`画像${index+1}を削除`);
  remove.addEventListener('click',()=>{if(busy)return;clearResult();URL.revokeObjectURL(images[index].url);images.splice(index,1);showImages();setBusy(false);selectionStatus();});
  card.append(img,name,remove);$('selected-images').append(card);
 });
}
async function loadFile(file){
 if(file.size>20*1024*1024)throw Error('1枚20MB以下の画像を選んでください。');
 if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('PNG・JPEG・WebPの画像を選んでください。');
 const url=URL.createObjectURL(file);
 try{const img=new Image();img.src=url;await img.decode();
  if(img.naturalWidth*img.naturalHeight>24000000)throw Error('画像が大きすぎます。2400万画素以下のスクショを選んでください。');
  return {canvas:normalize(img),name:file.name,url,width:img.naturalWidth,height:img.naturalHeight};
 }catch(e){URL.revokeObjectURL(url);throw e;}
}
async function addFiles(files){
 if(busy||!files.length)return;
 if(images.length+files.length>10){status('一度につなげられるのは10枚までです。不要な画像を削除してください。','error');$('files').value='';return;}
 setBusy(true);const loaded=[];let selected=false;
 try{
  for(const file of files){status(`画像を読み込んでいます… ${loaded.length+1} / ${files.length}枚`);loaded.push(await loadFile(file));}
  clearResult();images.push(...loaded);showImages();selectionStatus();selected=true;
 }catch(e){loaded.forEach(item=>URL.revokeObjectURL(item.url));status((e.message||'画像を読み込めませんでした。')+(images.length?' 選択済みの画像は残しています。':''),'error');}
 finally{setBusy(false);$('files').value='';if(selected&&images.length>=2)requestAnimationFrame(()=>{
  if(matchMedia('(max-width:850px)').matches)$('combine').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center'});
 });}
}
function activeJoin(){return info?.joins[Number($('join').value)||0];}
function showAdjustment(){
 const j=activeJoin();if(!j)return;const p=profiles[info.mode];
 $('shift').min=12;$('shift').max=p.bottom-p.top-65;$('shift').value=j.d;$('shift-value').textContent=j.d+' px';
 $('seam').min=p.top+j.d+1;$('seam').max=p.bottom-1;j.seam=Math.max(Number($('seam').min),Math.min(Number($('seam').max),j.seam));$('seam').value=j.seam;$('seam-value').textContent=j.seam+' px';
}
async function render(){
 if(!info)return;const current=++revision;
 const scale=Math.min(2,...images.map(im=>im.height/1080)),output=composeMany(images.map(im=>im.canvas),info,scale);
 const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));
 if(current!==revision)return;if(!blob)throw Error('画像を保存用に変換できませんでした。');
 if(resultURL)URL.revokeObjectURL(resultURL);resultBlob=blob;resultURL=URL.createObjectURL(blob);
 $('preview').src=resultURL;$('download').href=resultURL;$('download').download=profiles[info.mode].name+'_'+new Date().toISOString().slice(0,10)+'.png';
 $('empty').hidden=true;$('preview-wrap').hidden=false;$('save-area').hidden=false;$('adjust').hidden=false;$('dimensions').textContent=`${output.width} × ${output.height} px`;
 showAdjustment();
 const f=new File([blob],$('download').download,{type:'image/png'});let canShare=false;
 try{canShare=typeof navigator.share==='function'&&!!navigator.canShare?.({files:[f]});}catch{}
 $('share').hidden=!canShare;
}
async function combine(){
 if(busy||images.length<2)throw Error('スクショを2枚以上選んでください。');
 clearResult();setBusy(true);status('同じ項目の重なりを探しています…');await new Promise(r=>setTimeout(r,30));
 try{
  info=await analyzeMany(images.map(im=>im.canvas),$('mode').value,(done,total)=>status(`画像の順番と重なりを確認しています… ${done} / ${total}`));
  $('join').replaceChildren(...info.joins.map((j,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`つなぎ目${i+1}（画像${info.order[i]+1} → 画像${info.order[i+1]+1}）`;return option;}));
  await render();status(`${images.length}枚の${profiles[info.mode].name}を合成しました（画像${info.order.map(i=>i+1).join(' → ')}）。${info.confidence==='check'?'つなぎ目を拡大して確認してください。':'最終行まで入っているか確認してください。'}`,'success');
  return {mode:info.mode,order:info.order.map(i=>i+1),shifts:info.joins.map(j=>j.d),confidence:info.confidence};
 }catch(e){clearResult();status(e.message,'error');throw e;}finally{setBusy(false);}
}
async function adjust(delta,seam){
 const j=activeJoin();if(!j)throw Error('先に合成してください。');const p=profiles[info.mode];
 if(!Number.isInteger(delta)||delta<12||delta>p.bottom-p.top-65)throw Error('調整値が範囲外です。');
 if(!Number.isInteger(seam)||seam<p.top+delta+1||seam>=p.bottom)throw Error('つなぐ位置が範囲外です。');
 j.d=delta;j.seam=seam;await render();
}
function updateAdjustment(){if(!info)return;const d=Number($('shift').value),seam=Math.max(profiles[info.mode].top+d+1,Number($('seam').value));adjust(d,seam).catch(e=>status(e.message,'error'));}
$('files').addEventListener('change',e=>addFiles([...e.target.files]));
const drop=$('drop');
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag');});
drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');addFiles([...e.dataTransfer.files]);});
$('clear-images').addEventListener('click',()=>{if(busy)return;clearResult();images.forEach(im=>URL.revokeObjectURL(im.url));images=[];showImages();setBusy(false);selectionStatus();});
$('combine').addEventListener('click',()=>combine().catch(()=>{}));
$('mode').addEventListener('change',()=>{clearResult();status('画面の種類を変更しました。「1枚につなぐ」を押してください。');});
$('join').addEventListener('change',showAdjustment);
$('shift').addEventListener('input',updateAdjustment);$('seam').addEventListener('input',updateAdjustment);
$('minus').addEventListener('click',()=>{$('shift').stepDown();updateAdjustment();});$('plus').addEventListener('click',()=>{$('shift').stepUp();updateAdjustment();});
$('reset').addEventListener('click',()=>{const j=activeJoin();if(j)adjust(j.originalD,j.originalSeam).catch(e=>status(e.message,'error'));});
async function shareImage(){
 if(!resultBlob||sharing)return;const file=new File([resultBlob],$('download').download,{type:'image/png'});
 sharing=true;$('share').disabled=true;$('share-status').textContent='';
 try{await navigator.share({files:[file]});}
 catch(e){if(e.name!=='AbortError')$('share-status').textContent='共有できませんでした。「PNGを保存」から画像を保存し、共有先のアプリで添付してください。';}
 finally{sharing=false;$('share').disabled=false;}
}
$('share').addEventListener('click',shareImage);
if(document.modelContext?.registerTool){
 for(const tool of [
 {name:'read_stitch_state',title:'合成状態を確認',description:'現在の画像の枚数と、合成結果の状態を確認します。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({selectedImages:images.length,hasResult:!!resultBlob,mode:info?.mode??null,order:info?.order.map(i=>i+1)??[],shifts:info?.joins.map(j=>j.d)??[]})},
 {name:'combine_selected_screenshots',title:'選択済み画像を合成',description:'選択済みのスクショを合成してプレビューを更新します。保存や共有はしません。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:()=>combine()}
 ])Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{});
}
