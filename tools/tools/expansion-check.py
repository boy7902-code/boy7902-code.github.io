import importlib.util,threading,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('layout',ROOT/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 for w,h in [(1280,800),(390,844),(768,1024)]:
  page=b.new_page(viewport={'width':w,'height':h});errors=[];writes=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if r.request.method not in ['GET','HEAD']:writes.append(r.request.url)
   if r.request.url.startswith(url+'/') or r.request.url.startswith('data:'):r.continue_()
   elif 'raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/' in r.request.url:
    id=r.request.url.rsplit('/',1)[1].split('.')[0];f=Path('/tmp/deep-research/pokemon-expansion/cache')/(id+'.png')
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:r.continue_()
   else:r.abort()
  page.route('**/*',route)
  page.add_init_script(m.synthetic_state_script('2026-11-21T07:19:00'))
  page.goto(url+'/index.html',wait_until='domcontentloaded');page.wait_for_function('window.PokemonExpansion && window.FamilyDashboard')
  before=page.evaluate('JSON.stringify(FamilyDashboard.state)');storage=page.evaluate('localStorage.getItem("family-dashboard:v1")')
  page.locator('#dexOpenBtn').click();assert page.locator('[data-dexid]').count()==151
  page.locator('#pokemonExpansionOpen').click();assert page.locator('[data-info-species]').count()==20
  assert page.locator('[data-info-species="152"]').is_visible()
  page.wait_for_function("[...document.querySelectorAll('.pdx-expansion-card img')].filter(e=>{const r=e.getBoundingClientRect();return r.top<innerHeight && r.bottom>0}).every(e=>e.complete && e.naturalWidth>0)")
  page.screenshot(path=f'/downloads/pokemon-expansion-grid-{w}.png',full_page=False)
  page.locator('.pdx-expansion-search input').fill('197');assert page.locator('[data-info-species]').count()==1
  page.locator('[data-info-species="197"]').click();assert page.locator('.pdx-detail-body h2').inner_text()=='블래키'
  assert '입양' not in page.locator('.pdx-detail-body').inner_text()
  page.screenshot(path=f'/downloads/pokemon-expansion-detail-{w}.png',full_page=False)
  page.keyboard.press('Escape');assert page.locator('.pdx-expansion').is_visible()
  page.locator('.pdx-expansion-search input').fill('없는이름');assert page.locator('[data-info-species]').count()==0
  page.locator('.pdx-expansion-search input').fill('');page.get_by_role('button',name='다음',exact=True).click();assert page.locator('[data-info-species="172"]').count()==1
  for _ in range(3):page.get_by_role('button',name='다음',exact=True).click()
  assert page.locator('[data-info-species="251"]').count()==1
  assert page.get_by_role('button',name='다음',exact=True).is_disabled()
  page.keyboard.press('Escape');page.wait_for_function("document.activeElement===document.getElementById('pokemonExpansionOpen')")
  assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
  assert page.evaluate('localStorage.getItem("family-dashboard:v1")')==storage
  assert not writes,writes
  assert not errors,errors
  print('PASS',w,'151 collection unchanged / 100-info pagination / search / details / escape focus / state and storage unchanged / no writes')
  page.close()
 b.close()
s.shutdown()
