import importlib.util,threading,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('layout',R/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=s.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{s.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 def new(w=1180,h=820):
  page=b.new_page(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,device_scale_factor=2,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if 'app-dex-integrated.js' in r.request.url:
    src=(R/'app-dex-integrated.js').read_text();i=src.rfind('})();');src=src[:i]+';window.__refreshTest={FB,refreshWrites,refreshTrackSync,save,draw:v=>canvasDirty=v,renderStampBoards};'+src[i:];r.fulfill(body=src,content_type='application/javascript')
   elif r.request.url.startswith(url+'/') and 'firebase-boot' not in r.request.url:r.continue_()
   elif 'official-artwork/' in r.request.url:
    f=Path('/tmp/deep-research/pokemon-expansion/cache')/r.request.url.rsplit('/',1)[-1]
    if f.exists():r.fulfill(path=str(f),content_type='image/png')
    else:r.abort()
   else:r.abort()
  page.route('**/*',route);page.add_init_script("if(!localStorage.getItem('family-dashboard:v1')){"+m.synthetic_state_script('2026-11-21T19:40:00')+'}');page.goto(url+'/index.html');page.wait_for_function('window.__refreshTest&&window.FamilyDashboard');page.wait_for_timeout(1000);return page,errors
 for w,h in [(1280,700),(1365,690),(1180,700),(1024,600),(960,640)]:
  for zoom in [1,1.15,1.3]:
   page,e=new(w,h);page.add_style_tag(content='body{zoom:'+str(zoom)+'}')
   page.wait_for_timeout(200)
   checks=page.evaluate("""()=>['#schoolDetailsBtn','#allMissionsBtn','#dexOpenBtn','.width-access-tools button:first-child','.width-access-tools button:last-child'].map(sel=>{let e=document.querySelector(sel),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{sel,x:r.x,y:r.y,w:r.width,h:r.height,hit:hit&&(e===hit||e.contains(hit)),block:hit&&(hit.id||hit.className)}})""")
   assert all(c['hit'] for c in checks),(w,h,zoom,checks);print('PASS',w,h,zoom);page.screenshot(path=f'/downloads/tablet-diag-{w}-{zoom}.png');page.close()
 b.close()
s.shutdown()
