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
    src=(R/'app-dex-integrated.js').read_text();i=src.rfind('})();');src=src[:i]+';window.__refreshTest={FB,refreshWrites,refreshTrackSync,save,draw:v=>canvasDirty=v,renderStampBoards,renderAll,refreshDayView,SCHED_UI};'+src[i:];r.fulfill(body=src,content_type='application/javascript')
   elif r.request.url.startswith(url+'/') and 'firebase-boot' not in r.request.url:r.continue_()
   elif 'official-artwork/' in r.request.url:
    f=Path('/tmp/deep-research/pokemon-expansion/cache')/r.request.url.rsplit('/',1)[-1]
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:r.abort()
   else:r.abort()
  page.route('**/*',route);page.add_init_script("window.__reviewNow='2026-11-21T23:59:00';{const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[window.__reviewNow]))}static now(){return new NativeDate(window.__reviewNow).getTime()}}}");page.add_init_script("if(!localStorage.getItem('family-dashboard:v1')){"+m.synthetic_state_script('2026-11-21T19:40:00')+'}');page.add_init_script("{const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[window.__reviewNow]))}static now(){return new NativeDate(window.__reviewNow).getTime()}}}");page.goto(url+'/index.html');page.wait_for_function('window.__refreshTest&&window.FamilyDashboard');page.wait_for_timeout(1000);return page,errors
 for w,h in [(1180,820),(390,844)]:
  page,e=new(w,h)
  page.evaluate("""()=>{const s=FamilyDashboard.state;s.school={name:'합성학교',cls:'1학년',byDate:{'2026-11-21':{meal:'토요일급식'},'2026-11-22':{meal:'일요일급식'}}};s.missions[0].doneOn='2026-11-21';__refreshTest.renderAll();const c=document.querySelector('#letterCanvas');c.getContext('2d').fillRect(20,20,60,40);}""")
  before=page.evaluate('JSON.stringify(FamilyDashboard.state)');canvas=page.locator('#letterCanvas').evaluate('e=>e.toDataURL()')
  assert '토요일급식' in page.locator('#schoolBody').inner_text()
  page.evaluate("window.__reviewNow='2026-11-22T00:01:00';__refreshTest.refreshDayView()")
  page.wait_for_timeout(100)
  page.screenshot(path=f'/downloads/day-rollover-{w}.png')
  assert '일요일급식' in page.locator('#schoolBody').inner_text();assert page.locator('#choreList>.done').count()==0
  assert page.evaluate('__refreshTest.SCHED_UI.sel')=='2026-11-22'
  assert page.locator('#letterCanvas').evaluate('e=>e.toDataURL()')==canvas
  assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
  page.evaluate("__refreshTest.SCHED_UI.sel='2026-12-15';window.__reviewNow='2026-11-23T08:00:00';window.dispatchEvent(new Event('pageshow'))")
  assert page.evaluate('__refreshTest.SCHED_UI.sel')=='2026-12-15'
  assert page.locator('#letterCanvas').evaluate('e=>e.toDataURL()')==canvas
  page.evaluate("window.__reviewNow='2026-11-24T08:00:00';document.dispatchEvent(new Event('visibilitychange'))")
  assert page.evaluate('__refreshTest.SCHED_UI.sel')=='2026-12-15'
  assert page.locator('#letterCanvas').evaluate('e=>e.toDataURL()')==canvas
  if w==1180:
   page.evaluate("window.__reviewNow='2026-11-21T23:59:00';__refreshTest.refreshDayView()");assert '토요일급식' in page.locator('#schoolBody').inner_text()
   page.evaluate("window.__reviewNow='2026-11-22T00:01:00'");page.wait_for_timeout(16000);assert '일요일급식' in page.locator('#schoolBody').inner_text()
   assert page.locator('#letterCanvas').evaluate('e=>e.toDataURL()')==canvas
   assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
  assert not e,e;page.close();print('PASS rollover school/missions/calendar/manual selection/canvas/state',w,h)
 b.close()
s.shutdown()
