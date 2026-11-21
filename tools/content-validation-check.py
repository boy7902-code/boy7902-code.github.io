import importlib.util,threading,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('layout',R/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 for width in [1180,390]:
  page=b.new_page(viewport={'width':width,'height':844});external=[];errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if 'app-dex-integrated.js' in r.request.url:
    src=(R/'app-dex-integrated.js').read_text();i=src.rfind('})();');src=src[:i]+';window.__contentCheck={renderLetters,renderLinks,openLetter};'+src[i:];r.fulfill(body=src,content_type='application/javascript')
   elif r.request.url.startswith(url+'/') and 'firebase-boot' not in r.request.url:r.continue_()
   else:external.append(r.request.url);r.abort()
  page.route('**/*',route);page.add_init_script(m.synthetic_state_script('2026-11-22T06:00:00'));page.goto(url+'/index.html');page.wait_for_function('window.__contentCheck&&window.FamilyDashboard');page.wait_for_timeout(500);external.clear()
  before=page.evaluate('''()=>{const c=document.createElement('canvas');c.width=c.height=50;c.getContext('2d').fillRect(5,5,30,30);const s=FamilyDashboard.state;s.letters=[{id:'normal-letter',img:c.toDataURL('image/jpeg'),author:'합성 편지',when:'11/22'},{id:'unusual"id',img:'https://example.org/old-letter.png',author:'원본 보존 <시험>',when:'11/22'}];s.links=[{id:'valid',title:'합성 링크 <표시>',url:'https://example.org/family'},{id:'not-web',title:'열지 않는 주소',url:'about:blank'}];return JSON.stringify(s)}''')
  page.evaluate('__contentCheck.renderLetters();__contentCheck.renderLinks()');page.wait_for_timeout(200)
  assert page.locator('#gallery img').count()==1
  assert page.locator('#gallery').inner_text().find('원본 기록은 그대로 보관')>=0
  assert page.locator('#gallery button[data-act=letter-open]').nth(1).is_disabled()
  assert page.locator('#gallery [data-act=letter-del]').nth(1).get_attribute('data-id')=='unusual"id'
  assert page.locator('#linkList a').count()==1
  assert page.locator('#linkList a').get_attribute('href')=='https://example.org/family'
  assert '합성 링크 <표시>' in page.locator('#linkList').inner_text()
  assert not any('example.org' in u for u in external),external
  page.evaluate("document.querySelector('[data-apptab=letters]').click()")
  page.screenshot(path=f'/downloads/content-validation-prep-{width}.png',full_page=True)
  page.evaluate("__contentCheck.openLetter('normal-letter')")
  assert page.locator('#letterModal').is_visible()
  assert page.locator('#letterModalImg').get_attribute('src').startswith('data:image/jpeg;base64,')
  assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before
  assert not errors,errors
  print('PASS',width,'valid image/link retained; unsupported values blocked; records unchanged; no remote image request')
  page.close()
 b.close()
s.shutdown()
