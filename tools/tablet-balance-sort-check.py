import importlib.util,threading,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('layout',R/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 def new(w=1180,h=820,scenario='mixed'):
  page=b.new_page(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,device_scale_factor=2,user_agent='Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-T870) AppleWebKit/537.36 SamsungBrowser/29.0 Chrome/136.0.0.0 Safari/537.36');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if 'app-dex-integrated.js' in r.request.url:
    src=(R/'app-dex-integrated.js').read_text();i=src.rfind('})();');src=src[:i]+';window.__refreshTest={FB,refreshWrites,refreshTrackSync,save,draw:v=>canvasDirty=v,renderStampBoards};'+src[i:];r.fulfill(body=src,content_type='application/javascript')
   elif r.request.url.startswith(url+'/') and 'firebase-boot' not in r.request.url:r.continue_()
   elif 'official-artwork/' in r.request.url:
    f=Path('/tmp/deep-research/pokemon-expansion/cache')/r.request.url.rsplit('/',1)[-1]
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:r.abort()
   else:r.abort()
  page.route('**/*',route);page.add_init_script("{const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['2026-11-21T19:40:00']))}static now(){return new NativeDate('2026-11-21T19:40:00').getTime()}}}");page.add_init_script("if(!localStorage.getItem('family-dashboard:v1')){"+m.synthetic_state_script('2026-11-21T19:40:00')+'}');page.add_init_script("""if(!sessionStorage.getItem('sort-seeded')){const k='family-dashboard:v1',s=JSON.parse(localStorage.getItem(k));s.missions.forEach((x,i)=>{x.title=['밥 다 먹기','인사 잘하기','신발장 정리하기','책 읽기','가방 챙기기','손 씻기','방 정리하기','양치하기'][i];if("""+("true" if scenario=='all' else "[0,2].includes(i)")+"""){x.doneOn='2026-11-21';x.doneAt='18:00';x.earned=5;}});s.school={name:'예시 초등학교',cls:'1학년 2반',byDate:"""+("{}" if scenario=='empty' else "{'2026-11-21':{meal:'잡곡밥, 미역국, 닭갈비, 우유, 사과',timetable:'국어, 수학, 미술, 체육'}}")+"""};localStorage.setItem(k,JSON.stringify(s));sessionStorage.setItem('sort-seeded','yes')}""");page.goto(url+'/index.html');page.wait_for_function('window.__refreshTest&&window.FamilyDashboard');page.wait_for_timeout(1000);return page,errors
 def ordered(page):
  result=page.evaluate("[...document.querySelectorAll('#choreList>.chore')].map(e=>({id:e.dataset.id,done:e.classList.contains('done')}))")
  flags=[r['done'] for r in result];assert flags==sorted(flags),result
  return result
 for w,h in [(1280,700),(1180,820),(1024,600),(960,590),(820,1180),(390,844)]:
  for scenario in ['mixed','empty','all']:
   page,e=new(w,h,scenario);before=page.evaluate('JSON.stringify(FamilyDashboard.state)');initial=ordered(page)
   if w>=768 and h>=600:
    assert page.locator('#choreList>.chore').evaluate_all('rows=>rows.every(e=>{const b=e.querySelector(".mission-card-status").getBoundingClientRect(),t=e.querySelector(".chore-title").getBoundingClientRect();return b.bottom<=t.top||b.top>=t.bottom||b.right<=t.left||b.left>=t.right})'), 'mission badge overlaps title'
   if w>=768 and h>=600:
    assert page.locator('#schoolBody').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=14
    assert page.locator('#schoolDetailsBtn').bounding_box()['height']>=36
    if scenario=='empty':assert page.locator('#schoolBody .school-empty').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=14
    page.locator('#schoolDetailsBtn').tap();assert page.locator('#screenDetail').evaluate('e=>e.open');page.locator('#screenDetailClose').tap()
   assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
   if scenario=='mixed':
    first=initial[0]['id'];points=page.evaluate('FamilyDashboard.state.points.total');page.locator('#choreList>.chore').first.tap();page.wait_for_timeout(400)
    current=ordered(page);assert current[-1]['done'];assert any(r['id']==first and r['done'] for r in current)
    afterpoints=page.evaluate('FamilyDashboard.state.points.total');assert afterpoints==points+5,(points,afterpoints)
    page.reload();page.wait_for_function('window.FamilyDashboard');page.wait_for_timeout(700);assert ordered(page)==current
    assert page.evaluate('FamilyDashboard.state.points.total')==afterpoints
    page.screenshot(path=f'/downloads/school-sort-{w}.png')
   elif scenario=='empty':page.screenshot(path=f'/downloads/school-empty-{w}.png')
   assert not e,e;page.close();print('PASS Samsung UA school/sort/initial/toggle/reload/state',w,h,scenario)
 b.close()
s.shutdown()
