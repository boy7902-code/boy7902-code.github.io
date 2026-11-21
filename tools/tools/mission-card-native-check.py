import importlib.util,threading,os,shutil
from pathlib import Path
R=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('layout',R/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROME_BIN') or shutil.which('chromium') or shutil.which('google-chrome') or '/opt/google/chrome/chrome',args=['--no-sandbox'])
 for w,h in [(1024,768),(1180,820),(390,844)]:
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
  page.add_init_script('''(()=>{const k='family-dashboard:v1',s=JSON.parse(localStorage.getItem(k));s.missions.forEach((m,i)=>{m.title=['책 읽기','정리하기','양치하기'][i%3]});localStorage.setItem(k,JSON.stringify(s))})()''')
  page.goto(url+'/index.html',wait_until='domcontentloaded');page.wait_for_selector('.mission-card-status');page.wait_for_timeout(150)
  c=page.locator('#choreList>.chore').first;c.scroll_into_view_if_needed();ident=c.get_attribute('data-id');state=page.evaluate('JSON.stringify(FamilyDashboard.state)');storage=page.evaluate('localStorage.getItem("family-dashboard:v1")')
  assert page.locator('.chore-check').count()==0
  assert c.get_attribute('role')=='button'
  Path('/tmp/mission-card-evidence').mkdir(exist_ok=True)
  page.screenshot(path=f'/tmp/mission-card-evidence/before-{w}.png',full_page=True)
  box=c.bounding_box();x=box['x']+40;y=box['y']+40
  for dx,dy in [(80,0),(0,60)]:
   for event,xx,yy in [('pointerdown',x,y),('pointermove',x+dx,y+dy),('pointerup',x+dx,y+dy),('click',x+dx,y+dy)]:c.dispatch_event(event,dict(pointerId=7,clientX=xx,clientY=yy,bubbles=True))
   assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==state
   assert page.evaluate('localStorage.getItem("family-dashboard:v1")')==storage
  page.wait_for_timeout(750)
  c.scroll_into_view_if_needed();box=c.bounding_box();x=box['x']+40;y=box['y']+40
  session=page.context.new_cdp_session(page)
  session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x+80,'y':y}]})
  for d in [20,40,60,80]:
   session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+80-d,'y':y}]});page.wait_for_timeout(25)
  session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  page.wait_for_timeout(100)
  assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==state
  # A drag ending above a different card must not activate that second card either.
  for event,xx,yy in [('pointerdown',x,y),('pointermove',x+90,y),('pointerup',x+90,y)]:c.dispatch_event(event,dict(pointerId=7,clientX=xx,clientY=yy,bubbles=True))
  other=page.locator('#choreList>.chore').nth(1)
  other.dispatch_event('click',dict(clientX=x+100,clientY=y,bubbles=True))
  assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==state, ('crosscard',w,box)
  page.wait_for_timeout(750)
  c.scroll_into_view_if_needed()
  c.click(position={'x':40,'y':40});page.wait_for_function("id=>FamilyDashboard.state.missions.find(m=>m.id===id).doneOn==='2026-11-21'",arg=ident)
  assert page.evaluate('id=>FamilyDashboard.state.missions.find(m=>m.id===id).earned===5',ident)
  c=page.locator(f'#choreList>.chore[data-id="{ident}"]');assert c.get_attribute('aria-pressed')=='true';assert '✓ 완료' in c.inner_text()
  page.screenshot(path=f'/tmp/mission-card-evidence/done-{w}.png',full_page=True)
  c.focus();c.press('Enter');page.wait_for_function('id=>!FamilyDashboard.state.missions.find(m=>m.id===id).doneOn',arg=ident)
  c.focus();c.press('Space');page.wait_for_function("id=>FamilyDashboard.state.missions.find(m=>m.id===id).doneOn==='2026-11-21'",arg=ident)
  assert page.evaluate('id=>FamilyDashboard.state.missions.find(m=>m.id===id).earned===5',ident)
  page.reload(wait_until='domcontentloaded');page.wait_for_selector('.mission-card-status');assert page.locator(f'#choreList>.chore[data-id="{ident}"]').get_attribute('aria-pressed')=='true'
  assert not errors,errors;assert not writes,writes
  print('PASS',w,'swipe unchanged, tap once5P, Enter undo, Space redo, reload decorated')
  page.close()
 b.close()
s.shutdown()
