/* Presentation only. Existing stamp rewards are calculated and settled by firebase-sync.js. */
(()=>{
 let seen=null,latest=0,pending=0,reward=0,opened=false,dialog=null,returnFocus=null;
 function close(){if(!dialog)return;dialog.close();if(returnFocus?.isConnected)returnFocus.focus();}
 function reset(){seen=null;latest=0;pending=0;reward=0;opened=false;close();}
 function ensure(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='stampGift';dialog.className='stamp-gift';dialog.setAttribute('aria-labelledby','stampGiftTitle');
  dialog.innerHTML='<div class="stamp-gift-content"><button type="button" class="stamp-gift-close" aria-label="축하 화면 닫기">×</button><p class="stamp-gift-eyebrow">도장 10개를 다 모았어!</p><h2 id="stampGiftTitle">우와, 정말 잘했어!</h2><button type="button" class="stamp-gift-box" aria-label="선물상자를 열어 볼까?"><svg class="stamp-gift-emoji" aria-hidden="true" viewBox="0 0 180 180"><ellipse cx="90" cy="158" rx="63" ry="10" fill="#d6ae7933"/><rect x="35" y="73" width="110" height="78" rx="9" fill="#eaac63"/><path d="M88 73h22v78H88z" fill="#cd5962"/><rect x="26" y="58" width="128" height="28" rx="7" fill="#f2bf7d"/><path d="M88 58h22v28H88z" fill="#db6971"/><path d="M97 57C65 55 46 45 54 31c9-16 31-4 43 26Zm1 0c30-2 48-12 41-26-9-16-29-4-41 26Z" fill="#e7868b" stroke="#ba505e" stroke-width="5" stroke-linejoin="round"/><path d="m45 100 5-6m75 35 7-6" stroke="#ffdcac" stroke-width="4" stroke-linecap="round"/></svg><span class="stamp-gift-tap">톡! 눌러서 열어 봐</span></button><div class="stamp-gift-result" role="status" aria-live="polite" hidden><svg class="stamp-gift-spark" aria-hidden="true" viewBox="0 0 120 68"><path d="m36 30 24-8 24 8v26l-24 9-24-9Z" fill="#e8ad6b"/><path d="m60 38 24-8v26l-24 9Z" fill="#cf8e4a"/><path d="m36 30 24 8 24-8-24-8Z" fill="#7f5035"/><path d="m36 30-15-12 25-8 14 12Zm48 0 15-12-25-8-14 12Z" fill="#f4c58e"/><path d="m60 4 2 5 6 1-5 3v6l-4-4-6 2 2-6-3-4 6 1Z" fill="#dda141"/><path d="m17 9 3 8 9 2-8 4-2 9-4-8-9-2 8-5ZM105 38l3 7 8 1-7 4-1 8-5-6-8-1 6-5Z" fill="#efbf62"/></svg><strong id="stampGiftPoints"></strong><p id="stampGiftState"></p><p class="stamp-gift-fine">도장 10개를 모아서 받은 선물이야.<br>이 선물은 한 번만 받을 수 있어.</p></div><button type="button" class="stamp-gift-done">다음에 볼게</button></div>';
  document.body.appendChild(dialog);
  dialog.querySelector('.stamp-gift-close').addEventListener('click',close);dialog.querySelector('.stamp-gift-done').addEventListener('click',close);
  dialog.querySelector('.stamp-gift-box').addEventListener('click',()=>{if(opened)return;opened=true;paint();dialog.querySelector('.stamp-gift-done').focus();});
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
 }
 function paint(){
  if(!dialog)return;
  dialog.dataset.opened=String(opened);dialog.querySelector('.stamp-gift-box').hidden=opened;dialog.querySelector('.stamp-gift-result').hidden=!opened;
  dialog.querySelector('#stampGiftPoints').textContent='+'+reward+'P';dialog.querySelector('#stampGiftState').textContent='선물 포인트가 쏙 들어왔어! 정산 없이 자동 적립됐어.';
  dialog.querySelector('.stamp-gift-done').textContent=opened?'고마워!':'다음에 볼게';
 }
 function observe({connected,completed,pendingBonus}){
  if(!connected)return;
  const count=Math.max(0,Math.round(Number(completed)||0));pending=Math.max(0,Number(pendingBonus)||0);latest=count;
  // First authoritative snapshot is a baseline, not a new completion. Refresh and another device never award anything here.
  if(seen===null){seen=count;return;}
  if(count>seen){const delta=count-seen;seen=count;reward=(dialog?.open?reward:0)+delta*1;opened=false;ensure();paint();if(!dialog.open){returnFocus=document.activeElement;dialog.showModal();}dialog.querySelector('.stamp-gift-box').focus();}
  else if(dialog?.open)paint();
 }
 window.FamilyStampGift=Object.freeze({observe,reset});
})();
