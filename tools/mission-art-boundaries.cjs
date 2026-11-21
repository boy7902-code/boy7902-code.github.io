const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx0={window:{}};vm.runInNewContext(fs.readFileSync('pokemon-growth-paths.js','utf8'),ctx0);const paths=ctx0.window.PokemonGrowthPaths;const legacy=[175,446,25,133,35,39,1,4,7,143,54,132],missions=[],cards=[];
for(const species of legacy)for(const points of [0,1,2,3,4,5]){
 let id;for(let n=missions.length*1000;n<1e6;n++){const v='boundary-'+n,h=[...v].reduce((h,c)=>(h*31+c.codePointAt(0))>>>0,0);if(legacy[h%12]===species){id=v;break}}
 missions.push({id,points});const img={src:'https://example.invalid/'+species+'.png',after(){}};const caption={};const branches=paths.filter(p=>p.ids.includes(species)),h=[...id].reduce((h,c)=>(h*31+c.codePointAt(0))>>>0,0),chain=species===132?[132,131,150]:branches[h%branches.length]?.ids;cards.push({dataset:{id},querySelector:q=>q==='.mission-art'?img:caption,img,caption,expected:chain&&points>=1&&points<=3?chain[Math.min(points-1,chain.length-1)]:species});
}
const state={missions,partner:{species:172},caught:[25,1],points:100},before=JSON.stringify(state);
const list={querySelectorAll:()=>cards},ctx={FamilyDashboard:{state},document:{readyState:'complete',querySelector:()=>list},MutationObserver:class{observe(){}},requestAnimationFrame:fn=>fn(),PokemonGrowthPaths:paths};ctx.window=ctx;
vm.runInNewContext(fs.readFileSync('mission-point-art.js','utf8'),ctx);
for(const c of cards)assert(c.img.src.endsWith('/'+c.expected+'.png'));
assert.equal(JSON.stringify(state),before);console.log('PASS72 species/point combinations, all 12 anchors use canonical chains, 0/4/5 unchanged, decorative stable branch, partner/caught/balance unchanged');
