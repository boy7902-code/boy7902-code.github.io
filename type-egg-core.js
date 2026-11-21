/* Pure type-egg candidate selection. No storage, network or reward changes. */
(function(root){
 'use strict';
 const TYPES=['노말','불꽃','물','전기','풀','얼음','격투','독','땅','비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'];
 function pools(lines,info,canonical=null){
  const allowed=canonical?new Set(canonical.map(p=>'L'+p.ids.join('-'))):null;
  const out=Object.fromEntries(TYPES.map(t=>[t,new Map()]));
  for(const line of lines){
   if(allowed&&!allowed.has(line.key))continue;
   const base=line.stages?.[0];if(!base||base.artId&&base.artId!==base.id)continue;
   for(const type of new Set(info(base.id).types||[])){
    const pool=out[type];if(!pool)continue;
    if(!pool.has(base.id))pool.set(base.id,[]);
    if(!pool.get(base.id).includes(line.key))pool.get(base.id).push(line.key);
   }
  }
  return out;
 }
 function index(length){if(!Number.isInteger(length)||length<1)throw Error('empty candidate pool');const a=new Uint32Array(1),limit=Math.floor(4294967296/length)*length;do{root.crypto.getRandomValues(a)}while(a[0]>=limit);return a[0]%length;}
 function choose(pool,draw=index){const entries=[...pool.entries()];if(!entries.length)throw Error('empty candidate pool');const [species,paths]=entries[draw(entries.length)];return{species,key:paths[draw(paths.length)]};}
 function type(growth){const m=/^typeegg-(\d+)-/.exec(growth?.cycleId||'');return m?TYPES[Number(m[1])]||'': '';}
 function hidden(growth,xp){return !!type(growth)&&!growth.hatched&&Number(xp)<5;}
 root.FamilyTypeEgg=Object.freeze({TYPES,pools,choose,index,type,hidden});
})(typeof window==='object'?window:globalThis);
