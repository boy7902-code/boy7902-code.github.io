/* Decorative mission art only. Never changes rewards, partner, caught species or storage. */
(()=>{
 function install(){
  const list=document.querySelector('#choreList');if(!list||!window.FamilyDashboard)return;
  const legacy=[175,446,25,133,35,39,1,4,7,143,54,132];
  const paths=window.PokemonGrowthPaths||[];
  const nonEvolution=[132,131,150];
  let queued=false;
  function update(){
   queued=false;
   const data=new Map((FamilyDashboard.state.missions||[]).map(m=>[String(m.id),m]));
   list.querySelectorAll('.chore[data-id]').forEach(card=>{
    const mission=data.get(card.dataset.id),img=card.querySelector('.mission-art');if(!mission||!img)return;
    // Match original basePtsOf rounding, not earned total or early bonus.
    const points=Math.max(0,Math.round(Number(mission.points)||0));
    const hash=Array.from(String(mission.id||mission.title)).reduce((h,ch)=>(h*31+ch.codePointAt(0))>>>0,0);
    const original=legacy[hash%legacy.length];
    let id=original,note='';
    if(points>=1&&points<=3){
     if(original===132){id=nonEvolution[points-1];note=points+'P · 강함 그림 예시';}
     else {
      const branches=paths.filter(p=>p.ids.includes(original));
      if(branches.length){
       // Stable decorative example only. Does not choose, store or adopt a partner branch.
       const chain=branches[hash%branches.length].ids;
       id=chain[Math.min(points-1,chain.length-1)];
       const final=points>=chain.length;
       note=points+'P · '+(points===1?'기본형':final?'최종형':'중간형')+(branches.length>1?' 예시':chain.length===2?' · 2단계 계열':'');
      }
     }
    }
    card.querySelector('.mission-stage-note')?.remove();
    card.dataset.missionArtSpecies=String(id);
    const src=img.src.replace(/\/\d+\.png$/,'/'+id+'.png');if(img.src!==src){img.hidden=false;img.src=src;}
   });
  }
  function queue(){if(!queued){queued=true;requestAnimationFrame(update)}}
  new MutationObserver(queue).observe(list,{childList:true});update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
