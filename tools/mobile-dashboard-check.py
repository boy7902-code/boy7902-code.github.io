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
    src=(R/'app-dex-integrated.js').read_text();i=src.rfind('})();');src=src[:i]+';window.__refreshTest={FB,refreshWrites,refreshTrackSync,save,draw:v=>canvasDirty=v,renderStampBoards};'+src[i:];r.fulfill(body=src,content_type='application/javascript')
   elif r.request.url.startswith(url+'/') and 'firebase-boot' not in r.request.url:r.continue_()
   elif 'official-artwork/' in r.request.url:
    f=Path('/tmp/deep-research/pokemon-expansion/cache')/r.request.url.rsplit('/',1)[-1]
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:r.abort()
   else:r.abort()
  page.route('**/*',route);page.add_init_script("if(!localStorage.getItem('family-dashboard:v1')){"+m.synthetic_state_script('2026-11-21T19:40:00')+'}');page.goto(url+'/index.html');page.wait_for_function('window.__refreshTest&&window.FamilyDashboard');page.wait_for_timeout(1000);return page,errors
 for w,h in [(1180,820),(820,1180),(390,844),(360,640),(844,390)]:
  page,e=new(w,h);before=page.evaluate('JSON.stringify(FamilyDashboard.state)')
  for sel in ['#cardOverview','#cardSchool','#cardWish','.mission-stamp-board','.weekly-report','#cardChores']:
   assert page.locator(sel).is_visible(),(w,h,sel)
   page.locator(sel).scroll_into_view_if_needed()
   assert page.locator(sel).bounding_box()['width']<=w,(w,h,sel)
  page.locator('#cardOverview').scroll_into_view_if_needed();page.screenshot(path=f'/downloads/mobile-dashboard-top-{w}.png')
  page.locator('#cardWish').scroll_into_view_if_needed();page.screenshot(path=f'/downloads/mobile-dashboard-wish-{w}.png')
  page.locator('#schoolDetailsBtn').scroll_into_view_if_needed();page.locator('#schoolDetailsBtn').tap();assert page.locator('#screenDetail').is_visible();page.locator('#screenDetailClose').tap()
  page.locator('.apptabs .family-nav:not([data-records])').tap();page.wait_for_timeout(100)
  for sel in ['#cardOverview','#cardSchool','#cardWish']:assert page.locator('#familyInformation '+sel).count()==1
  page.locator('.apptabs [data-apptab="dash"]').tap();page.wait_for_timeout(100)
  for sel in ['#cardOverview','#cardSchool','#cardWish']:assert page.locator(sel).is_visible()
  assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
  assert not e,e;page.close();print('PASS same dashboard cards/scroll/reach/detail/family-tab restoration/return/state unchanged',w,h)
 page,e=new(390,844)
 for w,h in [(1180,820),(390,844),(820,1180),(844,390)]:
  page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(150)
  for sel in ['#cardOverview','#cardSchool','#cardWish']:assert page.locator(sel).is_visible(),(w,sel)
 assert not e,e;page.close();print('PASS resize ownership and dashboard/family homes')
 b.close()
s.shutdown()
