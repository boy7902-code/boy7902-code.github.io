import importlib.util,threading,json,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('layout',ROOT/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
# Structural fixture only, not a factual species record and never shipped as data.
fixture={"schemaVersion":1,"species":{"133":{"id":133,"genus":"검증용 분류","heightM":0.3,"weightKg":6.5,"abilities":[{"name":"검증용 특성","hidden":False},{"name":"보조자료 특성","hidden":True}],"description":{"text":"레이아웃 확인을 위한 합성 설명입니다. 여러 줄에서도 도감 설명이 잘 보이는지 확인해요.","version":"합성 테스트"},"evolution":[{"id":134,"name":"검증용 진화 1","types":["물"]},{"id":135,"name":"검증용 진화 2","types":["전기"]}],"sources":[{"url":"https://pokemonkorea.co.kr/pokedex/view/193","label":"출처 링크 렌더링 시험","fields":"합성자료, 실제 내용 검증 아님"}],"checkedAt":"2026-11-21"}}}
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 for w,h in [(1280,800),(390,844),(1024,600)]:
  page=b.new_page(viewport={'width':w,'height':h});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(url+'/') or 'raw.githubusercontent.com/PokeAPI/sprites' in r.request.url or r.request.url.startswith('data:') else r.abort())
  page.add_init_script(m.synthetic_state_script('2026-11-21T07:19:00'))
  page.goto(url+'/index.html',wait_until='domcontentloaded');page.wait_for_function('window.FamilyDashboard && window.PokemonEncyclopedia')
  before=page.evaluate('JSON.stringify(FamilyDashboard.state)')
  if not os.environ.get('REAL_DATA'): page.evaluate('(d)=>{window.PokemonEncyclopediaData=d}',fixture)
  # Actual grid rendering through the existing application entry point.
  page.locator('#dexOpenBtn').click()
  page.locator('#dexSearch').fill('133');page.locator('[data-dexid="133"]').click()
  page.locator('.pdx-open').click()
  assert page.locator('.pdx-dialog[open]').count()==1
  assert page.locator('.pdx-information').count()==1
  assert page.locator('.pdx-facts dd').count()==4
  assert ('진화포켓몬' if os.environ.get('REAL_DATA') else '검증용 분류') in page.locator('.pdx-information').inner_text()
  page.locator('.pdx-sources summary').click()
  assert page.locator('.pdx-sources a').first.get_attribute('href')=='https://pokemonkorea.co.kr/pokedex/view/193'
  page.locator('.pdx-dialog').evaluate('(el)=>el.scrollTop=0')
  page.locator('.pdx-evolution-list').evaluate('(el)=>el.scrollIntoView({block:"center"})')
  page.wait_for_function("Array.from(document.querySelectorAll('.pdx-dialog img')).every(i=>i.complete)")
  assert page.locator('.pdx-image-fallback').count()==0
  page.locator('.pdx-dialog').evaluate('(el)=>el.scrollTop=0')
  page.screenshot(path=f'/downloads/encyclopedia-{"eevee" if os.environ.get("REAL_DATA") else "structure"}-{w}.png',full_page=False)
  assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
  assert page.evaluate('document.documentElement.scrollWidth')<=w
  page.keyboard.press('Escape');assert page.locator('.pdx-dialog').count()==0
  page.evaluate("PokemonEncyclopedia.render(document.querySelector('#pokemonEncyclopediaInfo'),9999)")
  assert '확인 중' in page.locator('.pdx-detail-entry').inner_text()
  if os.environ.get('REAL_DATA') and w==1280:
   page.evaluate('''()=>{
    for(let id=1;id<=151;id++){
      const e=PokemonEncyclopediaData.species[id];
      PokemonEncyclopedia.show(id,{name:e.name,types:e.types,art:''});
      if(document.querySelector('.pdx-detail-hero h2').textContent!==e.name)throw new Error('Wrong species '+id);
      if(document.querySelectorAll('.pdx-facts dd').length!==4)throw new Error('Missing field '+id);
      if(!document.querySelector('.pdx-description p').textContent)throw new Error('Missing description '+id);
      if(document.querySelectorAll('.pdx-sources a').length!==2)throw new Error('Missing provenance '+id);
      PokemonEncyclopedia.close();
    }
   }''')
   assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
  assert not errors,errors
  print('PASS structure fixture',w,h,'no persistent-state change; missing-data fallback')
  page.close()
 b.close()
s.shutdown()
