/* Mission card controls. No state writes; original delegate owns eligibility, scoring, and undo restrictions. */
(()=>{
  if(!document.querySelector('#choreList'))return;
  const style=document.createElement('style');style.textContent='#choreList>.chore{cursor:pointer;position:relative;touch-action:pan-x pan-y}#choreList>.chore:focus-visible{outline:3px solid #9165c7;outline-offset:-3px}.mission-card-status{position:absolute;top:8px;right:8px;font-size:10px;line-height:20px;border-radius:10px;padding:0 6px;color:#775f38;background:#fff8e8;pointer-events:none}.chore.done .mission-card-status{background:#285d50;color:white}#choreList>.chore.done{background:#e7f3e8}#choreList>.chore .chore-tools{z-index:1}';document.head.append(style);
  let gesture=null,blocked=null;
  const cardOf=t=>t instanceof Element?t.closest('#choreList>.chore'):null;
  const excluded=t=>t instanceof Element&&t.closest('.chore-tools,button,input,a,select,textarea');
  const decorate=()=>document.querySelectorAll('#choreList>.chore').forEach(c=>{
    c.setAttribute('role','button');c.tabIndex=0;c.setAttribute('aria-pressed',String(c.classList.contains('done')));
    c.setAttribute('aria-label',`${c.querySelector('.chore-title')?.textContent||'미션'} ${c.classList.contains('done')?'완료됨, 취소':'완료하기'}`);
    const old=c.querySelector('.chore-check');if(old){old.remove();}
    if(!c.querySelector('.mission-card-status')){const mark=document.createElement('span');mark.className='mission-card-status';mark.setAttribute('aria-hidden','true');mark.textContent=c.classList.contains('done')?'✓ 완료':'톡 눌러 완료';c.append(mark);}
  });
  document.addEventListener('pointerdown',e=>{const c=cardOf(e.target);if(!c||excluded(e.target))return;gesture={id:e.pointerId,card:c,x:e.clientX,y:e.clientY,moved:false,scroll:c.closest('.mission-scroll')?.scrollLeft||0};},true);
  document.addEventListener('pointermove',e=>{if(gesture&&e.pointerId===gesture.id&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>10)gesture.moved=true;},true);
  const end=(e,cancel)=>{if(!gesture||e.pointerId!==gesture.id)return;const g=gesture;gesture=null;if(cancel||g.moved||Math.abs((g.card.closest('.mission-scroll')?.scrollLeft||0)-g.scroll)>3)blocked={card:g.card,until:performance.now()+700};};
  document.addEventListener('pointerup',e=>end(e,false),true);
  document.addEventListener('pointercancel',e=>end(e,true),true);
  document.addEventListener('click',e=>{const c=cardOf(e.target);if(!c||excluded(e.target))return;if((blocked&&blocked.card===c&&performance.now()<blocked.until)||(gesture&&gesture.moved)){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',e=>{const c=cardOf(e.target);if(!c||e.target!==c||e.repeat||!['Enter',' '].includes(e.key))return;e.preventDefault();c.click();},true);
  decorate();new MutationObserver(decorate).observe(document.querySelector('#choreList'),{childList:true});
})();
