import importlib.util,threading,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('layout',R/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 for w,h in [(1180,820),(820,1180),(390,844),(360,640)]:
  page=b.new_page(viewport={'width':w,'height':h});errs=[];page.on('pageerror',lambda e:errs.append(str(e)));requests=[]
  def route(r):
   if 'app-dex-integrated.js' in r.request.url:
    src=(R/'app-dex-integrated.js').read_text();i=src.rfind('})();');assert i>0;src=src[:i]+';window.__stampTest={FB,renderStampBoards};'+src[i:];r.fulfill(body=src,content_type='application/javascript')
   elif r.request.url.startswith(url+'/') and 'firebase-boot' not in r.request.url:r.continue_()
   elif 'official-artwork/' in r.request.url:
    f=Path('/tmp/deep-research/pokemon-expansion/cache')/r.request.url.rsplit('/',1)[-1]
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:r.abort()
   else:requests.append(r.request.url);r.abort()
  page.route('**/*',route);page.add_init_script(m.synthetic_state_script('2026-11-21T19:30:00'));page.goto(url+'/index.html');page.wait_for_function('window.__stampTest')
  before=page.evaluate('JSON.stringify(FamilyDashboard.state)');storage=page.evaluate('JSON.stringify(localStorage)')
  page.evaluate('''()=>{const t=__stampTest;t.FB.on=true;t.FB.lastStats={stampProgress:9,stampBoardsCompleted:4,stampBonusPending:0,stampBonusPoints:12};t.renderStampBoards()}''');assert not page.locator('#stampGift').count()
  page.evaluate('''()=>{const t=__stampTest;t.FB.lastStats={stampProgress:0,stampBoardsCompleted:5,stampBonusPending:3,stampBonusPoints:15};t.renderStampBoards()}''');assert page.locator('#stampGift').is_visible();assert page.locator('.stamp-gift-result').is_hidden();page.wait_for_timeout(550);page.screenshot(path=f'/downloads/stamp-gift-box-{w}.png')
  page.locator('.stamp-gift-box').click();assert page.locator('#stampGiftPoints').inner_text()=='+3P';assert '정산 대기' in page.locator('#stampGiftState').inner_text()
  for i in range(5):page.evaluate('__stampTest.renderStampBoards()')
  assert page.locator('#stampGiftPoints').inner_text()=='+3P'
  page.evaluate('__stampTest.FB.lastStats.stampBonusPending=0;__stampTest.renderStampBoards()');assert '반영' in page.locator('#stampGiftState').inner_text();page.wait_for_timeout(450);page.screenshot(path=f'/downloads/stamp-gift-open-{w}.png')
  box=page.locator('#stampGift').bounding_box();assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=w+1 and box['y']+box['height']<=h+1
  page.locator('.stamp-gift-done').click();page.evaluate('__stampTest.renderStampBoards()');assert not page.locator('#stampGift').is_visible();assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==before;assert page.evaluate('JSON.stringify(localStorage)')==storage
  page.reload();page.wait_for_function('window.__stampTest');page.evaluate('__stampTest.FB.on=true;__stampTest.FB.lastStats={stampBoardsCompleted:5,stampBonusPending:0};__stampTest.renderStampBoards()');assert page.locator('#stampGift').count()==0
  page.evaluate('__stampTest.FB.lastStats={stampBoardsCompleted:6,stampBonusPending:3};__stampTest.renderStampBoards()');page.keyboard.press('Escape');assert not page.locator('#stampGift').is_visible();assert not errs,errs;page.close();print('PASS actual-render/baseline/new-completion/open-once/settlement/refresh/escape/state-storage-unchanged',w,h)
 # Separate contexts have no shared claim or award code. Both can reveal the same existing reward without adding it.
 c1=b.new_context();c2=b.new_context()
 for c in [c1,c2]:
  q=c.new_page();q.goto('about:blank');q.add_script_tag(path=str(R/'stamp-gift.js'));q.evaluate('FamilyStampGift.observe({connected:true,completed:5,pendingBonus:0});FamilyStampGift.observe({connected:true,completed:6,pendingBonus:3})');q.locator('.stamp-gift-box').click();assert q.locator('#stampGiftPoints').inner_text()=='+3P';c.close()
 print('PASS two-independent-device-contexts presentation-only');b.close()
s.shutdown()
