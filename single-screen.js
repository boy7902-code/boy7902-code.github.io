/* Single-screen views move existing live nodes into a detail dialog, never clone
   controls or change their data. Photo blobs stay in this browser's IndexedDB. */
(function () {
  'use strict';
  const $=s=>document.querySelector(s);
  let dialog, slot, origin, moved, priorFocus, missionPage=0;
  const wide=matchMedia('(min-width:1024px)');
  function pageMissions() {
    const rows=Array.from(document.querySelectorAll('#choreList > .chore'));
    const visibleRow=rows.find(r=>!r.classList.contains('ss-page-hidden'));
    const rowHeight=visibleRow?visibleRow.getBoundingClientRect().height:56;
    const available=$('#missionScroll').clientHeight;
    const per=wide.matches?Math.max(1,Math.min(4,Math.floor((available+6)/(Math.max(51,rowHeight)+6)))):4;
    const pages=Math.max(1,Math.ceil(rows.length/per));
    missionPage=Math.min(missionPage,pages-1);
    rows.forEach((r,i)=>r.classList.toggle('ss-page-hidden', moved!==$('#choreList') && (i<missionPage*per||i>=(missionPage+1)*per)));
    const label=$('#missionPageLabel');
    if(label) label.textContent=rows.length?`${missionPage+1}/${pages} · 남은 미션 ${rows.length}개`:'오늘 미션';
    $('#missionPrev').disabled=missionPage===0;
    $('#missionNext').disabled=missionPage>=pages-1;
  }
  function closeDetails() {
    if(moved && origin) { origin.replaceWith(moved); moved=null;origin=null; }
    if(dialog.open) dialog.close();
    pageMissions();
    if(priorFocus && priorFocus.isConnected) priorFocus.focus({preventScroll:true});
  }
  function openDetails(node,title) {
    if(!node) return;
    if(dialog.open) closeDetails();
    priorFocus=document.activeElement;
    $('#screenDetailTitle').textContent=title;
    origin=document.createComment('detail-return');node.before(origin);moved=node;slot.append(node);
    dialog.showModal();pageMissions();$('#screenDetailClose').focus();
  }
  function renderInsights() {
    const dashboard=window.FamilyDashboard, core=window.FamilyDashboardInsights;
    if(!dashboard || !core)return;
    const state=dashboard.state, kid=dashboard.kid().id;
    const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const week=core.weekly((state.logs||[]).filter(l=>l&&(!l.member||l.member===kid)),today);
    const max=Math.max(1,...week.days.map(d=>d.points));
    $('#weeklyBars').replaceChildren(...week.days.map((d,i)=>{
      const el=document.createElement('div');el.className='weekly-day';
      const b=document.createElement('b');b.textContent=`${d.points}P`;
      const bar=document.createElement('i');bar.style.height=`${Math.max(2,Math.round(d.points/max*24))}px`;
      const label=document.createElement('span');label.textContent=['월','화','수','목','금','토','일'][i];el.append(b,bar,label);return el;
    }));
    $('#weeklySummary').textContent=`저장 기록 기준 이번 주 +${week.total}P · 미션 ${week.count}회 완료`;
    document.querySelectorAll('#wishList .wish-item').forEach(el=>{
      const wish=(state.wishlist||[]).find(w=>w.id===el.dataset.id);
      if(!wish||wish.boughtAt||!(+wish.need>0)||el.querySelector('.gift-estimate'))return;
      const left=Math.max(0,+wish.need-dashboard.pokemon().balance),days=core.estimate(left,week.average);
      const note=document.createElement('p');note.className='gift-estimate';
      note.textContent=!left?'목표 포인트를 모았어요!':days==null?'예상 기간은 획득 기록이 쌓이면 표시돼요':`최근 28일 중 모은 날 평균 ${Math.round(week.average)}P · 약 ${days}회 더 모으면 목표 예상`;
      el.querySelector('.wish-main').append(note);
    });
  }
  function install() {
    dialog=$('#screenDetail');slot=$('#screenDetailBody');
    $('#screenDetailClose').addEventListener('click',closeDetails);
    dialog.addEventListener('cancel',e=>{e.preventDefault();closeDetails();});
    dialog.addEventListener('click',e=>{if(e.target===dialog)closeDetails();});
    dialog.addEventListener('click',e=>{if(e.target.closest('[data-act]'))closeDetails();},true);
    $('#weatherDetailsBtn').addEventListener('click',()=>openDetails($('#outfitSuggestions'),'오늘 옷차림과 외출 준비'));
    $('#schoolDetailsBtn').addEventListener('click',()=>openDetails($('#schoolBody'),'오늘 학교 · 시간표와 급식'));
    $('#wishDetailsBtn').addEventListener('click',()=>openDetails($('#wishPane'),'사고 싶은 것 · 전체 목록'));
    $('#allMissionsBtn').addEventListener('click',()=>openDetails($('#choreList'),'전체 미션 · 완료와 쉬는 미션'));
    $('#weeklyDetailsBtn').addEventListener('click',()=>openDetails($('#weeklyReportContent'),'이번 주 성장 리포트'));
    $('#calDayDetailsBtn').addEventListener('click',()=>openDetails($('#calDay'),'선택한 날짜의 일정'));
    $('#missionPrev').addEventListener('click',()=>{missionPage--;pageMissions();});
    $('#missionNext').addEventListener('click',()=>{missionPage++;pageMissions();});
    const board=$('.mission-stamp-board'), area=$('.mission-area');
    area.append(board); // Always visible, below the report, not inside paginated missions.
    $('#stampBoardOpenBtn').addEventListener('click',()=>{board.querySelector('details').open=true;openDetails(board,'미션 도장판 · 안내');});
    new MutationObserver(pageMissions).observe($('#choreList'),{childList:true});
    wide.addEventListener('change',pageMissions);
    if(window.ResizeObserver)new ResizeObserver(pageMissions).observe($('#missionScroll'));
    pageMissions();
    // The existing public view exposes records read-only here; no save or scoring calls.
    let refreshQueued=false;
    new MutationObserver(()=>{if(refreshQueued)return;refreshQueued=true;requestAnimationFrame(()=>{refreshQueued=false;renderInsights();});}).observe($('#wishList'),{childList:true});
    renderInsights();
    const allowed=()=>window.FamilyDashboard.parent().unlocked;
    $('#familyPhotoSelect').addEventListener('click',()=>{if(allowed())$('#familyPhotoInput').click();else photoLocked();});
    $('#familyPhotoInput').addEventListener('change',e=>selectPhotos(e.target.files,allowed));
    $('#familyPhotoClear').addEventListener('click',()=>clearPhotos(allowed));
    ['pointerdown','touchstart'].forEach(type=>window.addEventListener(type,e=>{if(e.target.closest('.photo-controls'))e.stopPropagation();},true));
    initPhotos();
  }
  let dbPromise, photos=[], urls=[],photoIndex=0,photoTimer=null,paused=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function db() {
    if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('family-dashboard-local-photos',1);r.onupgradeneeded=()=>r.result.createObjectStore('album');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    return dbPromise;
  }
  async function store(action,value) {
    const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('album',action==='get'?'readonly':'readwrite');const s=tx.objectStore('album');const r=action==='get'?s.get('images'):s.put(value,'images');let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }
  function showPhoto() {
    const image=$('#familyPhoto');const empty=$('#familyPhotoEmpty');
    image.hidden=!urls.length;empty.hidden=!!urls.length;
    if(urls.length) { image.src=urls[photoIndex%urls.length];image.alt=`가족 사진 ${(photoIndex%urls.length)+1} / ${urls.length}`; }
    else image.removeAttribute('src');
    $('#familyPhotoCount').textContent=urls.length?`${photoIndex%urls.length+1} / ${urls.length}`:'사진을 아직 선택하지 않았어요';
  }
  function resetPhotoTimer() {
    clearInterval(photoTimer);photoTimer=null;
    if(!paused && !document.hidden && !$('#standby').hidden && urls.length>1) photoTimer=setInterval(()=>{photoIndex=(photoIndex+1)%urls.length;showPhoto();},10000);
  }
  function setPhotos(list) {
    urls.forEach(URL.revokeObjectURL);photos=list||[];urls=photos.map(x=>URL.createObjectURL(x));photoIndex=0;showPhoto();resetPhotoTimer();
  }
  async function resize(file) {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('JPG·PNG·WebP 사진만 선택해 주세요.');
    if(file.size>15*1024*1024) throw Error('사진 한 장은 15MB 이하로 선택해 주세요.');
    const image=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(image.width,image.height));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);image.close();
    return new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(Error('사진 변환에 실패했어요.')),'image/jpeg',.85));
  }
  function photoLocked() { $('#photoSettingsStatus').textContent='보호자 잠금 해제 후 사용해 주세요.'; }
  async function selectPhotos(files,allowed) {
    if(!allowed()) { photoLocked(); return; }
    const note=$('#photoSettingsStatus');
    try {
      const list=Array.from(files||[]);if(!list.length)return;
      if(list.length>12)throw Error('사진은 한 번에 최대 12장까지 선택해 주세요.');
      note.textContent='사진을 이 기기에 저장하는 중…';
      const blobs=[];for(const f of list)blobs.push(await resize(f));
      if(!allowed())throw Error('부모 잠금이 켜져 저장하지 않았어요. 다시 열어 주세요.');
      await store('put',blobs);setPhotos(blobs);note.textContent=`${blobs.length}장 저장 완료 · 이 브라우저에만 보관됩니다.`;
    }catch(e){note.textContent=e.message||'사진을 저장하지 못했어요. 기존 사진은 유지됩니다.';}
    finally{$('#familyPhotoInput').value='';}
  }
  async function clearPhotos(allowed) {
    if(!allowed()) { photoLocked(); return; }
    try{await store('put',[]);setPhotos([]);$('#photoSettingsStatus').textContent='이 기기의 액자 사진을 지웠어요.';}
    catch(e){$('#photoSettingsStatus').textContent='사진을 지우지 못했어요. 다시 시도해 주세요.';}
  }
  function initPhotos() {
    $('#familyPhotoPause').textContent=paused?'자동 넘김 재생':'자동 넘김 일시정지';
    $('#familyPhotoPause').setAttribute('aria-pressed',String(paused));
    store('get').then(setPhotos).catch(()=>{$('#photoSettingsStatus').textContent='이 브라우저에서는 사진 저장을 사용할 수 없어요.';});
    $('#familyPhotoPause').addEventListener('click',()=>{paused=!paused;$('#familyPhotoPause').textContent=paused?'자동 넘김 재생':'자동 넘김 일시정지';$('#familyPhotoPause').setAttribute('aria-pressed',String(paused));resetPhotoTimer();});
    $('#familyPhotoNext').addEventListener('click',()=>{if(urls.length){photoIndex=(photoIndex+1)%urls.length;showPhoto();resetPhotoTimer();}});
    new MutationObserver(resetPhotoTimer).observe($('#standby'),{attributes:true,attributeFilter:['hidden']});
    document.addEventListener('visibilitychange',resetPhotoTimer);
  }
  window.FamilyScreen=Object.freeze({openDetails,selectPhotos,clearPhotos});
  install();
})();
