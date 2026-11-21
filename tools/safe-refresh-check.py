import importlib.util,threading,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('layout',R/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 def new(w=1180,h=820):
  page=b.new_page(viewport={'width':w,'height':h});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if 'app-dex-integrated.js' in r.request.url:
    src=(R/'app-dex-integrated.js').read_text();i=src.rfind('})();');src=src[:i]+';window.__refreshTest={FB,refreshWrites,refreshTrackSync,save,draw:v=>canvasDirty=v,renderStampBoards};'+src[i:];r.fulfill(body=src,content_type='application/javascript')
   elif r.request.url.startswith(url+'/') and 'firebase-boot' not in r.request.url:r.continue_()
   elif 'official-artwork/' in r.request.url:
    f=Path('/tmp/deep-research/pokemon-expansion/cache')/r.request.url.rsplit('/',1)[-1]
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:r.abort()
   else:r.abort()
  page.route('**/*',route);page.add_init_script("if(!localStorage.getItem('family-dashboard:v1')){"+m.synthetic_state_script('2026-11-21T19:40:00')+'}');page.goto(url+'/index.html');page.wait_for_function('window.__refreshTest&&window.FamilyDashboard');page.wait_for_timeout(1000);return page,errors
 for w,h in [(1180,820),(1024,768),(820,1180),(390,844)]:
  page,e=new(w,h);btn=page.locator('#safeRefreshBtn');assert btn.is_visible();r=btn.bounding_box();assert r['x']>=0 and r['y']>=0 and r['x']+r['width']<=w+1 and r['y']+r['height']<=h+1;assert btn.locator('xpath=ancestor::details').count()==0;page.screenshot(path=f'/downloads/safe-refresh-{w}.png')
  page.evaluate('FamilyDashboard.state.wishlist.push({id:"refresh-preserved",title:"합성 저장 확인",need:30})');page.locator('#safeRefreshBtn').click();page.wait_for_function('window.FamilyDashboard&&FamilyDashboard.state.wishlist.some(w=>w.id==="refresh-preserved")');assert not e,e;page.close();print('PASS visible outside menu/reload preserves current state',w,h)
 page,e=new();nav=[];page.on('framenavigated',lambda f:nav.append(f.url));page.evaluate('''()=>{const input=document.createElement('textarea');input.id='refreshDraft';document.body.append(input)}''');page.locator('#refreshDraft').fill('합성 작성 중인 글');dialogs=[]
 def dismiss(d):dialogs.append(d.message);d.dismiss()
 page.on('dialog',dismiss);page.locator('#safeRefreshBtn').click();assert dialogs and not nav;assert page.locator('#refreshDraft').input_value()=='합성 작성 중인 글';print('PASS unsaved draft cancel keeps text/no reload');page.remove_listener('dialog',dismiss)
 page.on('dialog',lambda d:d.accept());page.locator('#safeRefreshBtn').click();page.wait_for_function('window.FamilyDashboard');assert nav;page.close();print('PASS explicit discard confirmation reload')
 page,e=new();page.on('dialog',dismiss);page.evaluate('__refreshTest.draw(true)');dialogs.clear();page.locator('#safeRefreshBtn').click();assert dialogs;page.evaluate('__refreshTest.draw(false)');page.remove_listener('dialog',dismiss)
 for flag in ['busy','settling']:
  page.evaluate('f=>__refreshTest.FB[f]=true',flag);page.locator('#safeRefreshBtn').click();assert '처리' in page.locator('.safe-refresh-note').inner_text();page.evaluate('f=>__refreshTest.FB[f]=false',flag)
 page.evaluate('__refreshTest.FB.missionOps.set("synthetic",{})');page.locator('#safeRefreshBtn').click();assert '처리' in page.locator('.safe-refresh-note').inner_text();page.evaluate('__refreshTest.FB.missionOps.clear()')
 page.evaluate('''()=>{window.testRelease=null;window.testSync=__refreshTest.refreshTrackSync({pushPatch:()=>new Promise(r=>testRelease=r)});window.testResult=testSync.pushPatch()}''');assert page.evaluate('FamilyDashboard.refreshStatus().busy');page.locator('#safeRefreshBtn').click();assert '처리' in page.locator('.safe-refresh-note').inner_text();page.evaluate('testRelease({ok:false})');page.wait_for_function('!FamilyDashboard.refreshStatus().busy');assert page.evaluate('FamilyDashboard.refreshStatus().failed');page.locator('#safeRefreshBtn').click();assert '저장하지 못한' in page.locator('.safe-refresh-note').inner_text()
 page.evaluate('testResult=testSync.pushPatch();testRelease({ok:true})');page.wait_for_function('!FamilyDashboard.refreshStatus().failed');assert not page.evaluate('FamilyDashboard.refreshStatus().busy');print('PASS mission/save/settling/in-flight-write/failure gates; successful retry clears failure')
 page.evaluate('__refreshTest.save()');assert page.evaluate('FamilyDashboard.refreshStatus().busy');page.wait_for_function('!FamilyDashboard.refreshStatus().busy');print('PASS debounced local save blocks until complete')
 page.evaluate('window.oldPhotoStatus=FamilyPhotoStatus;window.FamilyPhotoStatus=()=>({saving:true})');assert page.evaluate('FamilyDashboard.refreshStatus().busy');page.locator('#safeRefreshBtn').click();assert '처리' in page.locator('.safe-refresh-note').inner_text();page.evaluate('()=>{window.FamilyPhotoStatus=oldPhotoStatus}');print('PASS local photo save gate')
 page.evaluate('''()=>{window.oldSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('synthetic full')}}''');page.locator('#safeRefreshBtn').click();assert '안전하게 보관하지 못했어요' in page.locator('.safe-refresh-note').inner_text();page.evaluate('()=>{Storage.prototype.setItem=oldSet;}');assert not e,e;page.close();print('PASS storage write failure never reloads')
 b.close()
s.shutdown()
