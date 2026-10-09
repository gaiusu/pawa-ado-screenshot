import {analyzeMany,composeMany,profiles,maxShift} from './core.js?v=20261009-scroll-background';
import {readCanvas,readPartyShot,release,canvasBlob,composeSheet,pause} from './batch.js?v=20261009-scroll-background';
const $=id=>document.getElementById(id);
let images=[],info=null,resultBlob=null,resultURL=null,busy=false,revision=0,sharing=false;
let activeCanvases=[],batchResults=[],controller=null,resultLabel='能力データ';
let outputMode='single';
let memoVersion=0,memoTimer=null,sheetRefreshRequested=false,sheetRefreshRunning=false;
const imageSets={single:[],sheet:[]};
const modeTabs=[...document.querySelectorAll('[role="tab"][data-output-mode]')];
const isSheet=()=>outputMode==='sheet';
const fileLimit=()=>isSheet()?6:10;
const minimumFiles=()=>isSheet()?1:2;
function checkCancelled(){if(controller?.signal.aborted)throw new DOMException('処理を中止しました。','AbortError');}
function newFilename(label=resultLabel){
 const now=new Date(),pad=(value,length=2)=>String(value).padStart(length,'0');
 const date=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
 const time=`${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad(now.getMilliseconds(),3)}`;
 const id=crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8,'0');
 return `${label}_${date}_${time}_${id}.png`;
}
function status(text,type=''){ $('status').textContent=text;$('status').className='status '+type; }
function clearResult(){clearTimeout(memoTimer);sheetRefreshRequested=false;activeCanvases.forEach(release);activeCanvases=[];batchResults.forEach(r=>URL.revokeObjectURL(r.url));batchResults=[];$('batch-results').replaceChildren();$('batch-area').hidden=true;revision++;info=null;resultBlob=null;if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;$('preview').removeAttribute('src');$('download').removeAttribute('href');$('share-status').textContent='';$('preview-wrap').hidden=true;$('save-area').hidden=true;$('adjust').hidden=true;$('empty').hidden=false;$('dimensions').textContent='PNG';}
function setBusy(b){busy=b;document.body.classList.toggle('busy',b);$('combine').disabled=b||images.length<minimumFiles()||images.length>fileLimit();
 for(const id of ['files','mode','clear-images'])$(id).disabled=b;
 modeTabs.forEach(tab=>tab.disabled=b);
 document.querySelectorAll('.remove-image,.include-result,.slot-select,#adjust input,#adjust select,#adjust button').forEach(el=>el.disabled=b);
 $('cancel').hidden=!b;$('cancel').disabled=false;
}
function selectionStatus(){
 if(images.length>fileLimit()){status('選択できるのは'+fileLimit()+'枚までです。不要な画像を削除してください。','error');return;}
 if(images.length>=minimumFiles()){status(images.length+'枚を選択しました。'+(isSheet()?'「パーティシートを作る」を押してください。':'「1枚につなぐ」を押してください。'));return;}
 status(isSheet()?'各キャラのスクショを1枚ずつ、最大6枚選んでください。':images.length?'もう1枚以上のスクショを追加してください。':'同じ項目が1〜2段重なるスクショを、2枚以上選んでください。');
}
function showSettings(){
 const sheet=isSheet();
 $('sheet-options').hidden=!sheet;$('mode-setting').hidden=sheet;
 $('combine').textContent=sheet?'パーティシートを作る':'1枚につなぐ';
 $('upload-help').textContent=sheet?'1キャラにつき1枚、最大6枚を選んでください。選んだ順に配置し、あとから配置番号に合わせて入れ替えられます。':'同じ冒険者・同じタブの画像を選んでください。上下の順番は自動で判別します。';
 $('limit-hint').textContent=sheet?'1〜6枚・1キャラにつき1枚':'2〜10枚';
 $('scope').textContent=sheet?'写っている内容だけを切り取り・配置します。特殊能力欄の結合、キャラの自動分類、重複の除去は行いません。全項目を載せたい場合は「1枚の画像を作る」で先につないだ画像を選んでください。':'このゲームの横向き「能力データ」画面向けの試作版です。特殊能力・サクセスデータに対応。別画面や、重なりのない画像は合成できません。';
 $('empty-title').textContent=sheet?'6枚を1枚に':'全項目をまとめて見やすく';
 $('empty-help').textContent=sheet?'上部に自由記入欄、その下にスクショを横2列×縦3段で配置します。':'重複を合わせて、外側の背景をトリミング。文字や数値は元画像をそのまま使います。';
 $('save-help').textContent=sheet?'切り取り範囲と配置番号の対応を確認してから保存してください。':'最終行まで入っているか確認してから保存してください。';
 showImages();setBusy(false);selectionStatus();
}
function showImages(){
 $('selected-images').replaceChildren();$('clear-images').hidden=images.length===0;$('image-count').textContent=`${images.length} / ${fileLimit()}枚`;$('file-label').textContent=images.length?'画像を追加する':'スクショをまとめて選ぶ';
 images.forEach((item,index)=>{
  const card=document.createElement('div'),img=document.createElement('img'),name=document.createElement('p'),remove=document.createElement('button');
  card.className='input-item';if(item.url)img.src=item.url;img.width=item.width;img.height=item.height;img.alt=`選択した画像${index+1}`;name.textContent=`${index+1}. ${item.name}`;name.title=item.name;
  remove.type='button';remove.className='remove-image';remove.textContent='削除';remove.setAttribute('aria-label',`画像${index+1}を削除`);
  remove.addEventListener('click',()=>{if(busy)return;clearResult();URL.revokeObjectURL(images[index].url);images.splice(index,1);showImages();setBusy(false);selectionStatus();});
  if(item.url)card.append(img);else{const warning=document.createElement('p');warning.textContent=item.error;warning.className='error';card.append(warning);}card.append(name,remove);$('selected-images').append(card);
 });
}
async function loadFile(file){
 let canvas,thumb;
 try{
  if(isSheet()){const shot=await readPartyShot(file);return {file,name:file.name,url:URL.createObjectURL(shot.blob),width:shot.width,height:shot.height,partyBlob:shot.blob};}
  const decoded=await readCanvas(file);canvas=decoded.canvas;
  thumb=document.createElement('canvas');thumb.width=320;thumb.height=137;thumb.getContext('2d').drawImage(canvas,0,0,320,137);
  const blob=await canvasBlob(thumb,'image/jpeg',.8);
  return {file,name:file.name,url:URL.createObjectURL(blob),width:decoded.width,height:decoded.height};
 }finally{release(canvas);release(thumb);}
}
async function addFiles(files){
 if(busy||!files.length)return;
 if(images.length+files.length>fileLimit()){status('選択できるのは'+fileLimit()+'枚までです。不要な画像を削除してください。','error');$('files').value='';return;}
 controller=new AbortController();setBusy(true);const loaded=[];let selected=false;
 try{
  for(const file of files){checkCancelled();status('画像を読み込んでいます… '+(loaded.length+1)+' / '+files.length+'枚');
   loaded.push(await loadFile(file));
   checkCancelled();await pause();
  }
  clearResult();images.push(...loaded);showImages();selectionStatus();selected=true;
 }catch(e){loaded.forEach(item=>{if(item.url)URL.revokeObjectURL(item.url);});status(e.name==='AbortError'?'読み込みを中止しました。':(e.message||'画像を読み込めませんでした。')+(images.length?' 選択済みの画像は残しています。':''),'error');}
 finally{setBusy(false);$('files').value='';if(selected&&images.length>=minimumFiles())requestAnimationFrame(()=>{
  if(isSheet()||matchMedia('(max-width:850px)').matches)(isSheet()?$('selected-images'):$('combine')).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center'});
 });}
}
function activeJoin(){return info?.joins[Number($('join').value)||0];}
function showAdjustment(){
 const j=activeJoin();if(!j)return;const p=profiles[info.mode];
 $('shift').min=12;$('shift').max=maxShift(p);$('shift').value=j.d;$('shift-value').textContent=j.d+' px';
 $('seam').min=p.top+j.d+1;$('seam').max=p.bottom-1;j.seam=Math.max(Number($('seam').min),Math.min(Number($('seam').max),j.seam));$('seam').value=j.seam;$('seam-value').textContent=j.seam+' px';
}
async function displayOutput(output,label){
 const current=++revision,blob=await canvasBlob(output);checkCancelled();if(current!==revision)return false;
 if(resultURL)URL.revokeObjectURL(resultURL);resultLabel=label;resultBlob=blob;resultURL=URL.createObjectURL(blob);
 $('preview').src=resultURL;$('download').href=resultURL;$('download').download=newFilename();
 $('empty').hidden=true;$('preview-wrap').hidden=false;$('save-area').hidden=false;$('dimensions').textContent=output.width+' × '+output.height+' px';
 let canShare=false;try{const file=new File([blob],newFilename(),{type:'image/png'});canShare=typeof navigator.share==='function'&&!!navigator.canShare?.({files:[file]});}catch{}
 $('share').hidden=!canShare;return true;
}
async function render(){
 if(!info)return;const scale=Math.min(2,...images.map(im=>im.height/1080)),output=composeMany(activeCanvases,info,scale);
 try{await displayOutput(output,profiles[info.mode].name);$('adjust').hidden=false;showAdjustment();}finally{release(output);}
}
function showBatch(results){
 $('batch-area').hidden=false;$('batch-results').replaceChildren();
 results.forEach((r,i)=>{
  r.number=i+1;r.slot=i+1;r.url=URL.createObjectURL(r.blob);
  const card=document.createElement('article'),label=document.createElement('label'),input=document.createElement('input'),img=document.createElement('img'),text=document.createElement('p'),download=document.createElement('a');
  card.className='batch-card';input.type='checkbox';input.checked=true;input.className='include-result';input.setAttribute('aria-label','キャラ'+r.number+'をシートに含める');
  label.append(input,document.createTextNode('キャラ '+r.number+' をシートに含める'));img.src=r.url;img.alt='キャラ'+r.number+'の選択したスクショ';img.loading='lazy';
  text.textContent='選択した画像：'+images[r.indices[0]].name;download.textContent='このキャラを保存';download.className='secondary-link';download.href=r.url;download.download=newFilename('キャラ'+r.number+'_スクショ');
  download.addEventListener('click',()=>download.download=newFilename('キャラ'+r.number+'_スクショ'));
  input.addEventListener('change',async()=>{r.included=input.checked;await refreshSheet();});
  const slotLabel=document.createElement('label'),slot=document.createElement('select');slot.className='slot-select';slot.dataset.number=r.number;slot.setAttribute('aria-label','キャラ'+r.number+'の配置番号');
  for(let n=1;n<=6;n++){const option=document.createElement('option');option.value=n;option.textContent='位置 '+n+'（'+(n%2?'左':'右')+'・'+Math.ceil(n/2)+'段目）';slot.append(option);}slot.value=r.slot;
  slotLabel.className='slot-label';slotLabel.append(document.createTextNode('シート上の位置'),slot);
  slot.addEventListener('change',async()=>{const next=Number(slot.value),other=results.find(other=>other!==r&&other.slot===next);if(other)other.slot=r.slot;r.slot=next;document.querySelectorAll('.slot-select').forEach(select=>select.value=results.find(result=>result.number===Number(select.dataset.number)).slot);await refreshSheet();});
  card.append(label,img,slotLabel,text,download);$('batch-results').append(card);
 });

}
async function renderSheet(){
 const included=batchResults.filter(r=>r.included);
 if(!included.length){revision++;if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;resultBlob=null;$('preview').removeAttribute('src');$('download').removeAttribute('href');$('preview-wrap').hidden=true;$('save-area').hidden=true;$('empty').hidden=false;$('dimensions').textContent='PNG';status('シートに含めるキャラを1人以上選んでください。');return;}
 const version=memoVersion;
 const output=await composeSheet(included,{notes:[$('memo-1').value,$('memo-2').value]},checkCancelled);
 try{if(version!==memoVersion)return;if(await displayOutput(output,'パーティシート'))status(included.length+'枚のスクショを配置しました。','success');}finally{release(output);}
}
async function combine(){
 if(busy||images.length<minimumFiles()||images.length>fileLimit())throw Error('画像の枚数を確認してください。');
 clearResult();controller=new AbortController();setBusy(true);status('画像を確認しています…');await pause();
 try{
  if(isSheet()){
   checkCancelled();batchResults=images.map((item,index)=>({blob:item.partyBlob,width:item.width,height:item.height,indices:[index],included:true}));
   showBatch(batchResults);await renderSheet();
   return {characters:batchResults.length,order:batchResults.map(r=>r.indices[0]+1)};
  }
  for(const item of images){checkCancelled();if(item.error)throw Error(item.error);activeCanvases.push((await readCanvas(item.file)).canvas);await pause();}
  info=await analyzeMany(activeCanvases,$('mode').value,(done,total)=>{checkCancelled();status('画像の順番と重なりを確認しています… '+done+' / '+total);});checkCancelled();
  $('join').replaceChildren(...info.joins.map((j,i)=>{const option=document.createElement('option');option.value=i;option.textContent='つなぎ目'+(i+1)+'（画像'+(info.order[i]+1)+' → 画像'+(info.order[i+1]+1)+'）';return option;}));
  await render();status(images.length+'枚の'+profiles[info.mode].name+'を合成しました（画像'+info.order.map(i=>i+1).join(' → ')+'）。'+(info.confidence==='check'?'つなぎ目を拡大して確認してください。':'最終行まで入っているか確認してください。'),'success');
  return {mode:info.mode,order:info.order.map(i=>i+1),shifts:info.joins.map(j=>j.d),confidence:info.confidence};
 }catch(e){clearResult();status(e.name==='AbortError'?'処理を中止しました。選択した画像は残っています。':e.message,'error');throw e;}finally{setBusy(false);if(sheetRefreshRequested&&batchResults.length)refreshSheet();}
}
async function adjust(delta,seam){
 const j=activeJoin();if(!j)throw Error('先に合成してください。');const p=profiles[info.mode];
 if(!Number.isInteger(delta)||delta<12||delta>maxShift(p))throw Error('調整値が範囲外です。');
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
$('mode').addEventListener('change',()=>{clearResult();selectionStatus();});
function switchOutputMode(mode){
 if(busy||mode===outputMode)return;
 clearResult();imageSets[outputMode]=images;outputMode=mode;images=imageSets[mode];
 modeTabs.forEach(tab=>{const selected=tab.dataset.outputMode===mode;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});
 $('tool-panel').setAttribute('aria-labelledby','tab-'+mode);showSettings();
}
modeTabs.forEach((tab,index)=>{
 tab.addEventListener('click',()=>switchOutputMode(tab.dataset.outputMode));
 tab.addEventListener('keydown',event=>{
  if(busy)return;let target;
  if(event.key==='ArrowRight')target=(index+1)%modeTabs.length;
  else if(event.key==='ArrowLeft')target=(index+modeTabs.length-1)%modeTabs.length;
  else if(event.key==='Home')target=0;
  else if(event.key==='End')target=modeTabs.length-1;
  else return;
  event.preventDefault();switchOutputMode(modeTabs[target].dataset.outputMode);modeTabs[target].focus();
 });
});
async function refreshSheet(){
 if(!isSheet()||!batchResults.length)return;
 sheetRefreshRequested=true;
 if(busy||sheetRefreshRunning)return;
 clearTimeout(memoTimer);sheetRefreshRunning=true;controller=new AbortController();setBusy(true);
 try{do{sheetRefreshRequested=false;await renderSheet();}while(sheetRefreshRequested&&!controller.signal.aborted);}
 catch(e){sheetRefreshRequested=false;status(e.name==='AbortError'?'更新を中止しました。':e.message,'error');}
 finally{sheetRefreshRunning=false;setBusy(false);}
}
function updateMemo(){
 memoVersion++;revision++;clearTimeout(memoTimer);
 if(!isSheet()||!batchResults.length)return;
 sheetRefreshRequested=true;$('save-area').hidden=true;
 if(!sheetRefreshRunning)memoTimer=setTimeout(refreshSheet,120);
}
$('memo-1').addEventListener('input',updateMemo);
$('memo-2').addEventListener('input',updateMemo);
$('cancel').addEventListener('click',()=>{controller?.abort();$('cancel').disabled=true;status('中止しています…');});
$('join').addEventListener('change',showAdjustment);
$('shift').addEventListener('input',updateAdjustment);$('seam').addEventListener('input',updateAdjustment);
$('minus').addEventListener('click',()=>{$('shift').stepDown();updateAdjustment();});$('plus').addEventListener('click',()=>{$('shift').stepUp();updateAdjustment();});
$('reset').addEventListener('click',()=>{const j=activeJoin();if(j)adjust(j.originalD,j.originalSeam).catch(e=>status(e.message,'error'));});
async function shareImage(){
 if(!resultBlob||sharing||(isSheet()&&(sheetRefreshRequested||sheetRefreshRunning)))return;const file=new File([resultBlob],newFilename(),{type:'image/png'});
 sharing=true;$('share').disabled=true;$('share-status').textContent='';
 try{await navigator.share({files:[file]});}
 catch(e){if(e.name!=='AbortError')$('share-status').textContent='共有できませんでした。「PNGを保存」から画像を保存し、共有先のアプリで添付してください。';}
 finally{sharing=false;$('share').disabled=false;}
}
$('share').addEventListener('click',shareImage);
$('download').addEventListener('click',event=>{if(isSheet()&&(sheetRefreshRequested||sheetRefreshRunning)){event.preventDefault();return;}if(resultBlob)$('download').download=newFilename();});
if(document.modelContext?.registerTool){
 for(const tool of [
 {name:'read_stitch_state',title:'合成状態を確認',description:'現在の画像の枚数と、合成結果の状態を確認します。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({selectedImages:images.length,hasResult:!!resultBlob,mode:info?.mode??null,order:info?.order.map(i=>i+1)??[],shifts:info?.joins.map(j=>j.d)??[],characters:batchResults.length,outputMode})},
 {name:'combine_selected_screenshots',title:'選択済み画像を合成',description:'選択済みのスクショを合成してプレビューを更新します。保存や共有はしません。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:()=>combine()}
 ])Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{});
}

showSettings();
