import importlib.util,threading,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('layout',R/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 def new(w=1180,h=820):
  page=b.new_page(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,device_scale_factor=2,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if 'app-dex-integrated.js' in r.request.url:
    src=(R/'app-dex-integrated.js').read_text();i=src.rfind('})();');src=src[:i]+';window.__refreshTest={FB,refreshWrites,refreshTrackSync,save,draw:v=>canvasDirty=v,renderStampBoards,openPartnerPicker,typeEggPools,partnerOf,renderMissions,toggleMission,adoptTypeEgg,pickPartner,typeEggSecret,openDex};'+src[i:];r.fulfill(body=src,content_type='application/javascript')
   elif r.request.url.startswith(url+'/') and 'firebase-boot' not in r.request.url:r.continue_()
   elif 'official-artwork/' in r.request.url:
    f=Path('/tmp/deep-research/pokemon-expansion/cache')/r.request.url.rsplit('/',1)[-1]
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:r.abort()
   else:r.abort()
  page.route('**/*',route);page.add_init_script("if(!localStorage.getItem('family-dashboard:v1')){"+m.synthetic_state_script('2026-11-21T19:40:00')+'}');page.goto(url+'/index.html');page.wait_for_function('window.__refreshTest&&window.FamilyDashboard');page.wait_for_timeout(1000);return page,errors
 for w,h in [(1180,820),(820,1180),(390,844),(360,640)]:
  page,e=new(w,h);page.wait_for_function('window.FamilyTypeEgg');before=page.evaluate('JSON.stringify(FamilyDashboard.state)');page.evaluate('__refreshTest.openPartnerPicker("adopt")');assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before;assert page.locator('[data-eggtype]').count()==18
  counts=page.evaluate('Object.fromEntries(Object.entries(__refreshTest.typeEggPools()).map(([t,p])=>[t,p.size]))');print('TYPE POOLS',counts)
  page.wait_for_timeout(700);page.screenshot(path=f'/downloads/type-egg-picker-{w}.png');page.locator('[data-eggtype="페어리"]').scroll_into_view_if_needed();assert page.locator('[data-eggtype="페어리"]').is_visible();page.locator('[data-eggtype="불꽃"]').click();assert page.evaluate('FamilyDashboard.state.pokemon.xp')<200;assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before;page.locator('#partnerClose').click();page.evaluate('FamilyDashboard.state.pokemon.xp=200;__refreshTest.renderMissions();__refreshTest.openPartnerPicker("adopt")')
  old=page.evaluate('({points:JSON.stringify(FamilyDashboard.state.points),uses:JSON.stringify(FamilyDashboard.state.pointUses),partner:FamilyDashboard.state.pokemon.key})');page.locator('[data-eggtype="불꽃"]').click();page.wait_for_function('FamilyDashboard.state.pokemon.growth?.cycleId.startsWith("typeegg-")');assert page.locator('#partnerModal').is_hidden();assert page.locator('#charLevel').inner_text()=='새 파트너 알'
  chosen=page.evaluate('FamilyDashboard.state.pokemon.key');assert page.evaluate('__refreshTest.typeEggPools()["불꽃"].has(__refreshTest.partnerOf(FamilyDashboard.state.pokemon.key).stages[0].id)');assert page.evaluate('JSON.stringify(FamilyDashboard.state.points)')==old['points'];assert page.evaluate('JSON.stringify(FamilyDashboard.state.pointUses)')==old['uses'];assert page.evaluate('FamilyDashboard.state.pokemon.xp')==0
  assert '불꽃 타입 알' in page.locator('#partnerPill').inner_text();assert page.locator('#charNext').inner_text().find('알 부화')>=0;page.locator('#charStage').scroll_into_view_if_needed();page.screenshot(path=f'/downloads/type-egg-hidden-{w}.png');page.reload();page.wait_for_function('window.__refreshTest');assert page.evaluate('FamilyDashboard.state.pokemon.key')==chosen;assert page.locator('#charLevel').inner_text()=='새 파트너 알'
  page.evaluate('__refreshTest.openPartnerPicker("change")');assert page.locator('#partnerModal').is_hidden();page.evaluate('__refreshTest.pickPartner("L1-2-3")');assert page.evaluate('FamilyDashboard.state.pokemon.key')==chosen;page.evaluate('document.querySelector("#partnerModal").hidden=true')
  page.evaluate('FamilyDashboard.state.pokemon.xp=4;FamilyDashboard.state.missions[0].points=1;FamilyDashboard.state.missions[0].member="m3";__refreshTest.renderMissions();__refreshTest.toggleMission(FamilyDashboard.state.missions[0].id)');assert page.evaluate('FamilyDashboard.state.pokemon.growth.hatched');assert page.evaluate('FamilyDashboard.state.pokemon.key')==chosen;page.wait_for_timeout(1800);page.screenshot(path=f'/downloads/type-egg-hatched-{w}.png');assert not e,e;page.close();print('PASS choose type/200P eligibility/0Pegg/5Phatch/fixed outcome/reload/points preserved',w,h)
 for w,h in [(390,844),(1180,820)]:
  page,e=new(w,h)
  for t in page.evaluate('FamilyTypeEgg.TYPES'):
   page.evaluate('FamilyDashboard.state.pokemon.xp=200;__refreshTest.openPartnerPicker("adopt")')
   btn=page.locator('[data-eggtype="'+t+'"]');btn.scroll_into_view_if_needed();btn.tap();page.wait_for_function('FamilyDashboard.state.pokemon.xp===0')
   assert page.evaluate('FamilyTypeEgg.type(FamilyDashboard.state.pokemon.growth)')==t
   assert page.evaluate('__refreshTest.typeEggPools()[FamilyTypeEgg.type(FamilyDashboard.state.pokemon.growth)].has(__refreshTest.partnerOf(FamilyDashboard.state.pokemon.key).stages[0].id)')
   assert page.locator('#charEvo').is_hidden();assert page.locator('#charStage img').count()==0
   assert page.locator('#charLevel').inner_text()=='새 파트너 알'
  assert not e,e;page.close();print('PASS all18 type cards scroll/touch/adopt/type matches/identity hidden',w,h)
 page,e=new();page.evaluate('''()=>{const S=FamilyDashboard.state;S.pokemon.xp=200;window.oldPartner=JSON.stringify(S.pokemon);const t=__refreshTest;t.FB.on=true;t.FB.readyData=true;t.FB.partner={key:S.pokemon.key,sinceXp:0};window.calls=[];t.FB.sync={adoptPartner:args=>{calls.push(JSON.parse(JSON.stringify(args)));return new Promise(r=>window.finishAdoption=r)}};t.openPartnerPicker('adopt');t.adoptTypeEgg('불꽃');t.adoptTypeEgg('불꽃')}''');assert page.evaluate('calls.length')==1;page.evaluate('finishAdoption({ok:false})');page.wait_for_timeout(50);assert page.evaluate('JSON.stringify(FamilyDashboard.state.pokemon)')==page.evaluate('oldPartner');page.evaluate('void __refreshTest.adoptTypeEgg("불꽃")');assert page.evaluate('JSON.stringify(calls[0])===JSON.stringify(calls[1])');page.evaluate('finishAdoption({ok:true})');page.wait_for_function('FamilyDashboard.state.pokemon.xp===0');assert not e,e;page.close();print('PASS connected busy lock/failure preserves partner/retry same outcome/commit then apply')
 b.close()
s.shutdown()
