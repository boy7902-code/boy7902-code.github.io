import importlib.util,threading,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('layout',R/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
seed="""(()=>{const k='family-dashboard:v1',s=JSON.parse(localStorage.getItem(k));s.missions.forEach((m,i)=>{m.title=['밥 다 먹기','인사 잘하기','신발장 정리하기','책 읽기','가방 챙기기','손 씻기','방 정리하기','양치하기'][i];if(i<3)m.doneOn='2026-11-21'});s.events=[{id:'s1',date:'2026-11-21',time:'20:30',title:'함께 책 읽기',done:false}];s.school={name:'예시 초등학교',cls:'1학년',byDate:{'2026-11-21':{meal:'잡곡밥, 미역국, 닭갈비, 우유, 사과',timetable:'국어, 수학, 미술, 체육'}}};localStorage.setItem(k,JSON.stringify(s));localStorage.setItem('family-dashboard:weather',JSON.stringify({at:Date.now(),locName:'합성 날씨',now:{weather_code:3,temperature_2m:8,apparent_temperature:6},daily:[{date:'2026-11-21',min:4,max:10,pop:40,code:3}],air:{pm10:22,pm25:11}}));})()"""
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 def new(w,h,night=False,photo=False):
  page=b.new_page(viewport={'width':w,'height':h},has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if r.request.url.startswith(url+'/'):r.continue_()
   elif 'official-artwork/' in r.request.url:
    f=Path('/tmp/deep-research/pokemon-expansion/cache')/r.request.url.rsplit('/',1)[-1]
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:r.abort()
   else:r.abort()
  page.route('**/*',route);page.add_init_script(m.synthetic_state_script('2026-11-21T22:10:00' if night else '2026-11-21T19:10:00'));page.add_init_script(seed)
  if photo:
   page.add_init_script("""window.__photoReady=new Promise((resolve,reject)=>{const r=indexedDB.open('family-dashboard-local-photos',1);r.onupgradeneeded=()=>r.result.createObjectStore('album');r.onsuccess=()=>{const tx=r.result.transaction('album','readwrite');tx.objectStore('album').put([new Blob(['<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"600\"><rect width=\"800\" height=\"600\" fill=\"#6d8fa7\"/><circle cx=\"400\" cy=\"250\" r=\"140\" fill=\"#bfd8d0\"/><text x=\"180\" y=\"500\" font-size=\"42\">SYNTHETIC PHOTO</text></svg>'],{type:'image/svg+xml'})],'images');tx.oncomplete=()=>resolve();};});""")
  page.goto(url+'/index.html');page.wait_for_function('window.FamilyDashboard');return page,errors
 for w,h in [(1180,820),(1024,768),(1180,700),(820,1180),(390,844),(360,640)]:
  page,e=new(w,h);before=page.evaluate('JSON.stringify(FamilyDashboard.state)');page.locator('#standbyBtn').evaluate('(e)=>e.click()');limit=2 if w<=600 and h<720 else 3;assert page.locator('.sb-remaining li').count()==limit;assert '+'+str(5-limit)+'개' in page.locator('#sbMission').inner_text();assert '20:30' in page.locator('#sbNext').inner_text();assert '함께 책 읽기' in page.locator('#sbNext').inner_text();assert '코인' not in page.locator('#standby').inner_text();assert '경험치' not in page.locator('#standby').inner_text();assert page.locator('#sbSec').count()==0;assert page.locator('#sbMission button').count()==0
  for child in page.locator('.sb-remaining li').all():
   c=child.bounding_box();box=page.locator('#sbMission').bounding_box();assert c['y']+c['height'] <= box['y']+box['height'],('mission overflow',w,h,c,box)
  for id in ['sbTime','sbMission','sbNext','sbTap','standbyExit']:
   r=page.locator('#'+id).bounding_box();assert r['y']>=0 and r['y']+r['height']<=h+1,(w,h,id,r)
  assert page.locator('.family-photo-frame').is_hidden();page.screenshot(path=f'/downloads/clock-fit-{w}-{h}.png')
  page.touchscreen.tap(100,300);assert page.evaluate('FamilyDashboard.standby().on');page.touchscreen.tap(100,300);assert page.evaluate('FamilyDashboard.standby().on');page.touchscreen.tap(100,300);assert not page.evaluate('FamilyDashboard.standby().on');assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
  if w>600:assert page.evaluate('FamilyDashboard.standby().idleTimeoutMs')==300000
  else:assert page.evaluate('FamilyDashboard.standby().idleTimeoutMs')==0
  assert not e,e;page.close();print('PASS clock/read-only/remaining/next/bounds/3touch',w,h)
 for photo in [False,True]:
  page,e=new(1180,820,True,photo);page.wait_for_timeout(300);page.locator('#standbyBtn').evaluate('(e)=>e.click()');assert page.locator('#standby').get_attribute('data-quiet')=='1';assert '예정된 일정이 없어요' in page.locator('#sbNext').inner_text()
  if photo:page.wait_for_selector('#standby.has-photo');assert page.locator('#familyPhoto').is_visible();assert page.locator('#sbPoke').is_hidden()
  page.screenshot(path=f'/downloads/clock-night-photo-{photo}.png');assert not e,e;page.close();print('PASS night/no-next/photo',photo)
 page,e=new(1180,820);page.locator('#standbyMinutes').evaluate('(e)=>{e.value="10";e.dispatchEvent(new Event("change"))}');assert page.evaluate('FamilyDashboard.standby().idleTimeoutMs')==300000
 # Only the isolated artifact exposes parent session and timer controls,never production.
 page.close()
 page,e=new(1180,820);page.route('**/app-dex-integrated.js*',lambda r:r.fulfill(body=(R/'app-dex-integrated.js').read_text().replace('})();',';window.__clockTest={unlock:()=>parentSession.unlockedAt=Date.now(),reset:resetStandbyIdleTimer};})();'),content_type='application/javascript'));page.reload();page.wait_for_function('window.__clockTest');page.evaluate('__clockTest.unlock()');page.clock.install()
 for minutes in [0,10,5]:
  page.locator('#standbyMinutes').evaluate('(e,v)=>{e.value=String(v);e.dispatchEvent(new Event("change"))}',minutes);assert page.evaluate('FamilyDashboard.standby().idleTimeoutMs')==minutes*60000;assert page.evaluate('localStorage.getItem("family-dashboard:standby-minutes")')==str(minutes)
  if minutes:
   page.clock.run_for(minutes*60000-1000);print('BEFORE',minutes,page.evaluate('FamilyDashboard.standby()'));assert not page.evaluate('FamilyDashboard.standby().on');page.clock.run_for(1500);print('AFTER',minutes,page.evaluate('FamilyDashboard.standby()'));assert page.evaluate('FamilyDashboard.standby().on');page.locator('#standbyExit').click()
  else:page.clock.fast_forward(700000);assert not page.evaluate('FamilyDashboard.standby().on')
  page.evaluate('__clockTest.unlock()')
 assert not e,e;page.close();print('PASS setting lock/off/5min/10min/localpref timers')
 b.close()
s.shutdown()
