import importlib.util,threading,os,shutil
from pathlib import Path
R=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('layout',R/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROME_BIN') or shutil.which('chromium') or shutil.which('google-chrome') or '/opt/google/chrome/chrome',args=['--no-sandbox'])
 for w,h in [(1024,768),(1180,820),(820,1180),(390,844)]:
  page=b.new_page(viewport={'width':w,'height':h});errors=[];writes=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if r.request.method not in ['GET','HEAD']:writes.append(r.request.url)
   if r.request.url.startswith(url+'/'):r.continue_()
   elif 'official-artwork/' in r.request.url:
    id=r.request.url.rsplit('/',1)[1].split('.')[0];f=Path('/tmp/deep-research/pokemon-expansion/cache')/(id+'.png')
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:
     import urllib.request
     try:r.fulfill(body=urllib.request.urlopen(r.request.url).read(),content_type='image/png')
     except Exception:r.abort()
   else:r.abort()
  page.route('**/*',route);page.add_init_script("if(!localStorage.getItem('family-dashboard:v1')){"+m.synthetic_state_script('2026-11-21T16:15:00')+"}")
  page.add_init_script("""(()=>{const k='family-dashboard:v1',s=JSON.parse(localStorage.getItem(k));const legacy=[175,446,25,133,35,39,1,4,7,143,54,132],find=(species,n)=>{for(let i=n*1000;i<100000;i++){const id='art-'+i,h=[...id].reduce((h,c)=>(h*31+c.codePointAt(0))>>>0,0);if(legacy[h%12]===species)return id}};s.school={name:'예시 초등학교',cls:'1학년',byDate:{'2026-11-21':{meal:'밥, 국, 반찬',timetable:'1교시 국어, 2교시 수학, 3교시 미술'}}};s.missions=Array.from({length:8},(_,i)=>({id:find(i<3?133:i<6?175:i===6?25:446,i),title:['책 읽기','정리하기','양치하기'][i%3],points:i<6?i%3+1:i===6?3:3,due:'',bonus:0,member:'m3',days:[],doneOn:null,doneAt:'',earned:0,goalMet:false,earlyBonusEarned:0}));localStorage.setItem(k,JSON.stringify(s))})()""")
  page.goto(url+'/index.html',wait_until='domcontentloaded');page.wait_for_timeout(200);print('ERRORS',errors);print(page.evaluate('({ready:document.readyState,refresh:!!window.FamilyRefresh,media:matchMedia("(orientation:landscape)").matches,scripts:[...document.scripts].slice(-2).map(e=>e.src)})'));page.wait_for_selector('.chore[data-mission-art-species]',timeout=1000)
  before=page.evaluate('JSON.stringify(FamilyDashboard.state)');storage=page.evaluate('localStorage.getItem("family-dashboard:v1")')
  page.wait_for_function("document.querySelectorAll('.chore[data-mission-art-species]').length===8");assert page.locator('.mission-stage-note').count()==0
  ids=page.locator('#choreList>.chore .mission-art').evaluate_all("els=>els.map(e=>Number(e.src.match(/(\\d+)\\.png$/)[1]))")
  assert ids[0]==133 and ids[1] in [134,135,136,196,197,470,471,700] and ids[2] in [134,135,136,196,197,470,471,700] and ids[3:]==[175,176,468,26,143],ids
  assert page.locator('.mission-stage-note').count()==0
  assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
  assert page.evaluate('localStorage.getItem("family-dashboard:v1")')==storage
  page.wait_for_function("[...document.querySelectorAll('#choreList>.chore .mission-art')].slice(0,6).every(i=>i.complete&&i.naturalWidth)")
  page.wait_for_timeout(350);page.screenshot(path=f'/downloads/card-clean-{w}.png',full_page=True)
  page.locator('.mission-scroll').evaluate("(e)=>e.scrollTo({left:498,behavior:'instant'})");page.wait_for_timeout(350)
  print('ARTSCROLL',page.locator('.mission-scroll').evaluate('(e)=>({x:e.scrollLeft,w:e.scrollWidth,client:e.clientWidth})'))
  page.screenshot(path=f'/downloads/mission-point-art-non-evolving-{w}.png',full_page=True)
  page.locator('.mission-scroll').evaluate('(e)=>e.scrollLeft=0')
  c=page.locator('#choreList>.chore').first;ident=c.get_attribute('data-id');partner=page.evaluate('JSON.stringify(FamilyDashboard.state.pokemon)')
  c.click(position={'x':40,'y':40});page.wait_for_function("id=>FamilyDashboard.state.missions.find(m=>m.id===id).doneOn==='2026-11-21'",arg=ident)
  assert page.evaluate('id=>FamilyDashboard.state.missions.find(m=>m.id===id).earned===1',ident)
  c=page.locator(f'#choreList>.chore[data-id="{ident}"]');assert c.locator('.mission-art').get_attribute('src').endswith('/133.png')
  c.focus();c.press('Enter');page.wait_for_function('id=>!FamilyDashboard.state.missions.find(m=>m.id===id).doneOn',arg=ident)
  assert c.locator('.mission-art').get_attribute('src').endswith('/133.png')
  assert not errors,errors;assert not writes,writes
  print('PASS',w,ids,'storageunchanged beforeclick,1Ppreserved,re-renderfixedfamily')
  page.close()
 b.close()
s.shutdown()
