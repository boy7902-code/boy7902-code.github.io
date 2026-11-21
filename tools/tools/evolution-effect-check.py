import importlib.util,threading,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('layout',ROOT/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 for w,h,reduced,xp,points,expected in [(1280,720,False,39,1,'피카츄'),(390,844,False,39,1,'피카츄'),(1024,600,True,39,1,'피카츄'),(1280,720,False,89,1,'라이츄'),(1280,720,False,199,1,'이로치 라이츄'),(1280,720,False,0,100,'라이츄')]:
  page=b.new_page(viewport={'width':w,'height':h},reduced_motion='reduce' if reduced else 'no-preference');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(url+'/') or 'raw.githubusercontent.com/PokeAPI/sprites' in r.request.url or r.request.url.startswith('data:') else r.abort())
  script=m.synthetic_state_script('2026-11-21T07:19:00')
  page.add_init_script(script+'''\nconst st=JSON.parse(localStorage.getItem('family-dashboard:v1'));st.pokemon.xp=XP_VALUE;st.missions[0].title='테스트 미션';st.missions[0].points=POINT_VALUE;localStorage.setItem('family-dashboard:v1',JSON.stringify(st));'''.replace('XP_VALUE',str(xp)).replace('POINT_VALUE',str(points)))
  page.goto(url+'/index.html',wait_until='domcontentloaded');page.wait_for_function('window.FamilyDashboard && window.PokemonEvolutionEffect')
  before=page.evaluate('JSON.stringify(FamilyDashboard.state)')
  page.locator('#choreList>.chore').first.click()
  page.wait_for_selector('.pe-dialog[open]');page.wait_for_timeout(1750)
  assert expected in page.locator('#pe-title').text_content()
  assert page.evaluate('FamilyDashboard.pokemon().xp')==xp+points
  assert page.evaluate("document.documentElement.scrollWidth")<=w
  box=page.locator('.pe-close').bounding_box();assert box and box['x']>=0 and box['x']+box['width']<=w
  page.screenshot(path=f'/downloads/evolution-effect-{w}.png',full_page=False) if xp==39 else None
  snapshot=page.evaluate('JSON.stringify(FamilyDashboard.state)')
  page.keyboard.press('Escape');assert page.locator('.pe-dialog').count()==0
  assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==snapshot
  # Standalone preview does not grant points, cards or change any saved state.
  page.evaluate("PokemonEvolutionEffect.show({from:{id:25,name:'피카츄'},to:{id:26,name:'라이츄'},xp:90})")
  page.locator('.pe-close').click();assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==snapshot
  assert not errors,errors
  print('PASS evolution',xp,'->',xp+points,expected,'dismiss/read-only, viewport',w,h,'reduced',reduced)
  page.close()
 b.close()
s.shutdown()
