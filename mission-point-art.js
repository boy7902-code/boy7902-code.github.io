/* Decorative mission art only. Never changes rewards, partner, caught species or storage. */
(()=>{
 function install(){
  const list=document.querySelector('#choreList');if(!list||!window.FamilyDashboard)return;
  const legacy=[175,446,25,133,35,39,1,4,7,143,54,132];
  const triples={1:[1,2,3],4:[4,5,6],7:[7,8,9],132:[132,131,150]};
  let queued=false;
  function update(){
   queued=false;
   const data=new Map((FamilyDashboard.state.missions||[]).map(m=>[String(m.id),m]));
   list.querySelectorAll('.chore[data-id]').forEach(card=>{
    const mission=data.get(card.dataset.id),img=card.querySelector('.mission-art');if(!mission||!img)return;
    // Match original basePtsOf rounding, not earned total or early bonus.
    const points=Math.max(0,Math.round(Number(mission.points)||0));
    const hash=Array.from(String(mission.id||mission.title)).reduce((h,ch)=>(h*31+ch.codePointAt(0))>>>0,0);
    const original=legacy[hash%legacy.length],chain=triples[original];
    // All other original species, including two-stage lines, retain their current art.
    const id=chain&&points>=1&&points<=3?chain[points-1]:original;
    const src=img.src.replace(/\/\d+\.png$/,'/'+id+'.png');if(img.src!==src){img.hidden=false;img.src=src;}
   });
  }
  function queue(){if(!queued){queued=true;requestAnimationFrame(update)}}
  new MutationObserver(queue).observe(list,{childList:true});update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
