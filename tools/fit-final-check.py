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
   if 'app-dex-integrated.js' in r.request.url:
    code=(R/'app-dex-integrated.js').read_text();pos=code.rfind('})();');code=code[:pos]+';window.__fitTest={wish:renderWish};'+code[pos:];r.fulfill(body=code,content_type='application/javascript')
   elif r.request.url.startswith(url+'/'):r.continue_()
   elif 'official-artwork/' in r.request.url:
    f=Path('/tmp/deep-research/pokemon-expansion/cache')/r.request.url.rsplit('/',1)[-1]
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:r.abort()
   else:r.abort()
  page.route('**/*',route);page.add_init_script(m.synthetic_state_script('2026-11-21T22:10:00' if night else '2026-11-21T19:10:00'));page.add_init_script(seed)
  if photo:
   page.add_init_script("""window.__photoReady=new Promise((resolve,reject)=>{const r=indexedDB.open('family-dashboard-local-photos',1);r.onupgradeneeded=()=>r.result.createObjectStore('album');r.onsuccess=()=>{const tx=r.result.transaction('album','readwrite');tx.objectStore('album').put([new Blob(['<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"600\"><rect width=\"800\" height=\"600\" fill=\"#6d8fa7\"/><circle cx=\"400\" cy=\"250\" r=\"140\" fill=\"#bfd8d0\"/><text x=\"180\" y=\"500\" font-size=\"42\">SYNTHETIC PHOTO</text></svg>'],{type:'image/svg+xml'})],'images');tx.oncomplete=()=>resolve();};});""")
  page.goto(url+'/index.html');page.wait_for_function('window.FamilyDashboard');return page,errors

 for w,h in [(1180,820),(1180,700),(820,1180),(390,844)]:
  page,e=new(w,h);before=page.evaluate('JSON.stringify(FamilyDashboard.state)')
  if w>=768:
   assert page.evaluate('document.documentElement.scrollHeight')==h
   for id in ['appTabs','schoolDetailsBtn','allMissionsBtn','dexOpenBtn']:
    r=page.locator('#'+id).bounding_box();assert r['y']>=0 and r['y']+r['height']<=h+1,(id,r)
   page.locator('#schoolDetailsBtn').click();assert '체육' in page.locator('#screenDetailBody').inner_text();page.locator('#screenDetailClose').click()
  page.locator('#dexOpenBtn').click();page.locator('#dexSearch').fill('152');page.locator('[data-dexid="152"]').click();pick=page.locator('[data-dexpick="L152-153-154"]');pick.scroll_into_view_if_needed();assert pick.is_visible();page.screenshot(path=f'/downloads/final-fit-dex-bottom-{w}.png');page.locator('#dexExtrasToggle').click();assert page.locator('#dexPlay').is_visible();page.locator('#dexExtrasToggle').click();assert page.locator('#dexPlay').is_hidden();page.locator('#dexClose').click();assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
  if w>=768:page.screenshot(path=f'/downloads/final-fit-dashboard-{w}-{h}.png')
  page.evaluate("""(()=>{const s=FamilyDashboard.state;s.wishlist=[{id:'high',title:'나중 선물',need:200},{id:'low',title:'가까운 선물',need:120},{id:'can',title:'지금 선물',need:50},{id:'unset',title:'미정',need:0},{id:'bought',title:'받은 선물',need:20,boughtAt:'2026-11-20'}];__fitTest.wish();})()""");assert page.locator('#wishList>.wish-item').evaluate_all('(xs)=>xs.map(x=>x.dataset.id)')==['can','low','high','unset','bought'];baseline=page.evaluate('JSON.stringify(FamilyDashboard.state.wishlist)');page.evaluate('FamilyDashboard.state.points.total=250;FamilyDashboard.state.points.byMember.m3=250;__fitTest.wish()');assert page.locator('#wishList>.wish-item').evaluate_all('(xs)=>xs.map(x=>x.dataset.id)')==['high','low','can','unset','bought'];assert page.evaluate('JSON.stringify(FamilyDashboard.state.wishlist)')==baseline
  assert not e,e;page.close();print('PASS fit/details/dexexpand/scrollend/read-only/wishsort',w,h)
 b.close()
s.shutdown()
