/* Reload is deliberate, never a write trigger. In-flight saves must finish first. */
(()=>{
 const button=document.getElementById('safeRefreshBtn');if(!button)return;
 const initial=new WeakMap(),edited=new Set();let approved=false,noticeTimer;
 const textField=e=>e&&e.matches('textarea,input:not([type]),input[type=text],input[type=number],input[type=date],input[type=time],input[type=url],input[type=email],input[type=search],[contenteditable=true]');
 const value=e=>e.isContentEditable?e.textContent:e.value;
 document.addEventListener('focusin',e=>{if(textField(e.target)&&!initial.has(e.target))initial.set(e.target,value(e.target));},true);
 document.addEventListener('input',e=>{const t=e.target;if(!textField(t))return;if(!initial.has(t))initial.set(t,t.defaultValue||'');if(value(t)!==initial.get(t))edited.add(t);else edited.delete(t);},true);
 function drafts(){return [...edited].some(e=>e.isConnected&&e.getClientRects().length&&value(e)!==initial.get(e));}
 function message(text){let n=document.querySelector('.safe-refresh-note');if(!n){n=document.createElement('div');n.className='safe-refresh-note';n.setAttribute('role','status');document.body.appendChild(n);}n.textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.remove(),5500);}
 function state(){return window.FamilyDashboard?.refreshStatus?.()||{busy:true};}
 function blocked(s){if(s.busy){message('아직 저장하거나 미션을 처리하고 있어요. 끝난 뒤 다시 눌러 주세요.');return true;}if(s.failed){message('저장하지 못한 기록이 있어요. 먼저 연결과 저장 상태를 확인해 주세요.');return true;}return false;}
 button.addEventListener('click',()=>{
  const s=state();if(blocked(s))return;
  const openEditor=!!document.querySelector('.modal:not([hidden]),dialog[open]:not(#stampGift)');
  if((drafts()||s.drawing||openEditor)&&!window.confirm('아직 작성 중인 글이나 그림이 있을 수 있어요. 저장하지 않은 내용은 사라져요. 그래도 새로고침할까요?'))return;
  if(blocked(state()))return;
  const result=window.FamilyDashboard.refreshSaveLocal();if(!result.ok){message('기록을 안전하게 보관하지 못했어요. 새로고침하지 않았어요.');return;}
  approved=true;window.location.reload();
 });
 window.addEventListener('beforeunload',e=>{const s=state();if(!approved&&(drafts()||s.drawing||s.busy||s.failed)){e.preventDefault();e.returnValue='';}});
})();
