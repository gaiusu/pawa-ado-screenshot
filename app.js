import {normalize,analyze,compose,profiles} from './core.js';
const $=id=>document.getElementById(id);
let images=[null,null],canvases=[null,null],info=null,resultBlob=null,resultURL=null,busy=false,revision=0;
const slots=['before','after'];
const selectedCount=()=>images.filter(Boolean).length;
function status(text,type=''){ $('status').textContent=text;$('status').className='status '+type; }
function clearResult(){revision++;info=null;resultBlob=null;if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;$('preview').removeAttribute('src');$('download').removeAttribute('href');$('x-download').removeAttribute('href');$('x-sharing').hidden=true;$('share-x').setAttribute('aria-expanded','false');$('share-status').textContent='';$('preview-wrap').hidden=true;$('save-area').hidden=true;$('adjust').hidden=true;$('empty').hidden=false;$('dimensions').textContent='PNG';}
function setBusy(b){busy=b;document.body.classList.toggle('busy',b);$('combine').disabled=b||selectedCount()!==2;slots.forEach(slot=>$('file-'+slot).disabled=b);$('mode').disabled=b;}
async function loadFile(file){
 if(file.size>20*1024*1024)throw Error('1枚20MB以下の画像を選んでください。');
 if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('PNG・JPEG・WebPの画像を選んでください。');
 const url=URL.createObjectURL(file);
 try{const img=new Image();img.src=url;await img.decode();
  if(img.naturalWidth*img.naturalHeight>24000000)throw Error('画像が大きすぎます。2400万画素以下のスクショを選んでください。');
  return {img,name:file.name,url};
 }catch(e){URL.revokeObjectURL(url);throw e;}
}
async function selectFile(index,files){
 if(busy||files.length===0)return;
 if(files.length!==1){status('それぞれの枠に、画像を1枚だけ選んでください。','error');return;}
 clearResult();
 setBusy(true);status('画像を読み込んでいます…');
 let loaded=null;
 try{
  loaded=await loadFile(files[0]);const canvas=normalize(loaded.img);
  const slot=slots[index],im=document.createElement('img'),name=document.createElement('p');
  im.src=loaded.url;im.alt=index===0?'選択したスクロール前の画像':'選択したスクロール後の画像';name.textContent=loaded.name;
  const previous=images[index];images[index]=loaded;canvases[index]=canvas;
  $('thumb-'+slot).replaceChildren(im,name);$('thumb-'+slot).hidden=false;$('label-'+slot).textContent='画像を選び直す';
  if(previous)URL.revokeObjectURL(previous.url);
  status(selectedCount()===2?'前後の画像がそろいました。「1枚につなぐ」を押してください。':`続けて、スクロール${index===0?'後':'前'}の画像を選んでください。`);
 }catch(e){if(loaded)URL.revokeObjectURL(loaded.url);status((e.message||'画像を読み込めませんでした。選び直してください。')+(images[index]?' 選択済みの画像は残しています。':''),'error');}
 finally{setBusy(false);$('file-'+slots[index]).value='';}
}
async function render(){
 if(!info)return;const current=++revision;
 const scale=Math.min(2,images[info.order].img.naturalHeight/1080);
 const output=compose(canvases,info,scale);
 const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));
 if(current!==revision)return;if(!blob)throw Error('画像を保存用に変換できませんでした。');
 if(resultURL)URL.revokeObjectURL(resultURL);resultBlob=blob;resultURL=URL.createObjectURL(blob);
 $('preview').src=resultURL;$('download').href=resultURL;$('download').download=profiles[info.mode].name+'_'+new Date().toISOString().slice(0,10)+'.png';
 $('x-download').href=resultURL;$('x-download').download=$('download').download;
 $('empty').hidden=true;$('preview-wrap').hidden=false;$('save-area').hidden=false;$('adjust').hidden=false;$('dimensions').textContent=`${output.width} × ${output.height} px`;
 $('shift').min=12;$('shift').max=profiles[info.mode].bottom-profiles[info.mode].top-65;$('shift').value=info.d;$('shift-value').textContent=info.d+' px';
 $('seam').min=profiles[info.mode].top+info.d+1;$('seam').max=profiles[info.mode].bottom-1;info.seam=Math.max(Number($('seam').min),Math.min(Number($('seam').max),info.seam));$('seam').value=info.seam;$('seam-value').textContent=info.seam+' px';
 const f=new File([blob],$('download').download,{type:'image/png'});let canShare=false;
 try{canShare=typeof navigator.share==='function'&&!!navigator.canShare?.({files:[f]});}catch{}
 $('share').hidden=!canShare;$('x-native').hidden=!canShare;
}
async function combine(){
 if(busy||selectedCount()!==2)throw Error('スクロール前と後の画像を、それぞれ選んでください。');
 clearResult();setBusy(true);status('同じ項目の重なりを探しています…');await new Promise(r=>setTimeout(r,30));
 try{info=analyze(canvases,$('mode').value);info.originalSeam=info.seam;await render();status(`${profiles[info.mode].name}を合成しました。${info.confidence==='check'?'つなぎ目を拡大して確認してください。':'最終行まで入っているか確認してください。'}`,'success');return {mode:info.mode,shift:info.d,confidence:info.confidence};}
 catch(e){clearResult();status(e.message,'error');throw e;}finally{setBusy(false);}
}
async function adjust(delta,seam){if(!info)throw Error('先に合成してください。');const p=profiles[info.mode];if(!Number.isInteger(delta)||delta<12||delta>p.bottom-p.top-65)throw Error('調整値が範囲外です。');if(!Number.isInteger(seam)||seam<p.top+delta+1||seam>=p.bottom)throw Error('つなぐ位置が範囲外です。');info.d=delta;info.seam=seam;await render();return {shift:info.d,seam:info.seam};}
function updateAdjustment(){if(!info)return;const d=Number($('shift').value),seam=Math.max(profiles[info.mode].top+d+1,Number($('seam').value));adjust(d,seam).catch(e=>status(e.message,'error'));}
slots.forEach((slot,index)=>{
 $('file-'+slot).addEventListener('change',e=>selectFile(index,[...e.target.files]));
 const drop=$('drop-'+slot);
 drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag');});
 drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));
 drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');selectFile(index,[...e.dataTransfer.files]);});
});
$('combine').addEventListener('click',()=>combine().catch(()=>{}));
$('mode').addEventListener('change',()=>{clearResult();status('画面の種類を変更しました。「1枚につなぐ」を押してください。');});
$('shift').addEventListener('input',updateAdjustment);$('seam').addEventListener('input',updateAdjustment);
$('minus').addEventListener('click',()=>{$('shift').stepDown();updateAdjustment();});$('plus').addEventListener('click',()=>{$('shift').stepUp();updateAdjustment();});
$('reset').addEventListener('click',()=>{if(info)adjust(info.originalD,info.originalSeam).catch(e=>status(e.message,'error'));});
let sharing=false;
async function shareImage(){
 if(!resultBlob||sharing)return;
 const file=new File([resultBlob],$('download').download,{type:'image/png'});
 sharing=true;$('share').disabled=true;$('share-x-native').disabled=true;$('share-status').textContent='';
 try{await navigator.share({files:[file]});}
 catch(e){if(e.name!=='AbortError'){
  $('x-sharing').hidden=false;$('share-x').setAttribute('aria-expanded','true');
  $('share-status').textContent='共有メニューを開けませんでした。画像を保存して、Xの投稿画面で添付してください。';
 }}finally{sharing=false;$('share').disabled=false;$('share-x-native').disabled=false;}
}
$('share').addEventListener('click',shareImage);$('share-x-native').addEventListener('click',shareImage);
$('share-x').addEventListener('click',()=>{if(!resultBlob)return;const expanded=$('x-sharing').hidden;$('x-sharing').hidden=!expanded;$('share-x').setAttribute('aria-expanded',String(expanded));});
// Optional browser agent interface, using the same validated actions as the screen.
if(document.modelContext?.registerTool){
 for(const tool of [
 {name:'read_stitch_state',title:'合成状態を確認',description:'現在の画像の枚数と、合成結果の状態を確認します。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({selectedImages:selectedCount(),beforeSelected:!!images[0],afterSelected:!!images[1],hasResult:!!resultBlob,mode:info?.mode??null,shift:info?.d??null})},
 {name:'combine_selected_screenshots',title:'選択済み画像を合成',description:'ユーザーが選択済みのスクショ2枚を合成してプレビューを更新します。保存や共有はしません。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:()=>combine()},
 {name:'adjust_stitch',title:'つなぎ目を調整',description:'プレビューの縦方向のずれとつなぐ位置を調整します。',inputSchema:{type:'object',properties:{shift:{type:'integer'},seam:{type:'integer'}},required:['shift','seam'],additionalProperties:false},annotations:{readOnlyHint:false},execute:x=>adjust(x.shift,x.seam)}
 ])Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{});
}
