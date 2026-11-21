/* Pure prototype state model. No network, storage, points or rewards. */
(function(root){
  'use strict';
  const HATCH_XP=5;
  function normalized(value){
    if(!value || typeof value!=='object' || typeof value.cycleId!=='string' || !value.cycleId)return null;
    return {cycleId:value.cycleId,hatched:value.hatched===true,celebrated:value.celebrated===true};
  }
  function isEgg(value,xp){const s=normalized(value);return !!s&&!s.hatched&&Number(xp)<HATCH_XP;}
  function adopt(cycleId){if(!cycleId)throw new Error('cycleId required');return {cycleId:String(cycleId),hatched:false,celebrated:false};}
  function transition(value,beforeXp,afterXp,undoPolicy){
    const state=normalized(value);
    if(!state)return {state:null,event:null}; // A legacy partner never becomes an egg.
    const before=Math.max(0,Number(beforeXp)||0),after=Math.max(0,Number(afterXp)||0);
    if(state.hatched&&after<HATCH_XP&&after<before){
      if(undoPolicy!=='keep-hatched'&&undoPolicy!=='return-to-egg')return {state,event:null,unresolved:'hatch-undo-policy'};
      if(undoPolicy==='return-to-egg')state.hatched=false;
    }
    let event=null;
    if(!state.hatched&&after>=HATCH_XP){state.hatched=true;if(!state.celebrated){state.celebrated=true;event='hatch';}}
    return {state,event};
  }
  root.PartnerGrowthCore=Object.freeze({HATCH_XP,normalized,isEgg,adopt,transition});
})(typeof window==='object'?window:globalThis);
