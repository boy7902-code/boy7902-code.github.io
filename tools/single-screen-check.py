import importlib.util,threading,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('layout',ROOT/'tools/dashboard-layout-check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
server=m.ThreadingHTTPServer(('127.0.0.1',0),m.QuietHandler);threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}'
with m.sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/google/chrome/chrome',args=['--no-sandbox'])
 for w,h in [(1280,800),(1024,600),(390,844),(1280,720)]:
  page=b.new_page(viewport={'width':w,'height':h});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(url+'/') or r.request.url.startswith('data:') else r.abort())
  page.add_init_script(m.synthetic_state_script('2026-11-20T12:00:00'));page.goto(url+'/index.html',wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('#choreList > .chore').length===8");page.evaluate('document.fonts.ready');page.wait_for_timeout(100)
  geom=page.evaluate('''() => {const rows=[...document.querySelectorAll('#choreList>.chore:not(.ss-page-hidden)')];const box=document.querySelector('#missionScroll').getBoundingClientRect();return {pageHeight:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,visible:rows.length,complete:rows.every(x=>x.getBoundingClientRect().bottom<=box.bottom+1),stampBottom:document.querySelector('.mission-stamp-board').getBoundingClientRect().bottom,schoolButton:document.querySelector('#schoolDetailsBtn').getBoundingClientRect().bottom};}''')
  assert geom['width']<=w,(w,geom)
  if w>=1024:assert geom['complete'] and geom['stampBottom']<=h and geom['schoolButton']<=h,(w,h,geom)
  if w>=1024:
   meter=page.evaluate('''() => {const p=document.querySelector('.char-panel').getBoundingClientRect();return ['todayGot','todayGoal','todayPct'].every(id=>{let r=document.getElementById(id).getBoundingClientRect();return r.height>0&&r.top>=p.top&&r.bottom<=p.bottom&&r.right<=p.right;});}''')
   assert meter,(w,h,'today numbers clipped')
  page.screenshot(path=f'/downloads/single-{w}x{h}.png',full_page=True)
  initial_state=page.evaluate('JSON.stringify(FamilyDashboard.state)')
  ids=[]
  for _ in range(8):
   ids.extend(page.locator('#choreList>.chore:not(.ss-page-hidden)').evaluate_all('(els)=>els.map(e=>e.dataset.id)'))
   if page.locator('#missionNext').is_disabled():break
   page.locator('#missionNext').click()
  assert len(set(ids))==8,(w,ids)
  page.locator('#allMissionsBtn').click();assert page.locator('#screenDetail').evaluate('(e)=>e.open')
  assert page.locator('#screenDetail #choreList > .chore:visible').count()==8
  page.keyboard.press('Escape');assert not page.locator('#screenDetail').evaluate('(e)=>e.open');assert page.locator('#allMissionsBtn').evaluate('(e)=>e===document.activeElement')
  page.locator('#schoolDetailsBtn').click();
  if w==1280 and h==800:page.screenshot(path='/downloads/single-school-popup.png',full_page=True)
  assert page.locator('#screenDetail #schoolBody').count()==1;page.locator('#screenDetailClose').click();assert page.locator('#cardSchool #schoolBody').count()==1
  page.locator('#wishDetailsBtn').click();assert page.locator('#screenDetail .wish-item:visible').count()==12;page.locator('#screenDetailClose').click()
  page.locator('#weeklyDetailsBtn').click();assert page.locator('#screenDetail #weeklyReportContent').count()==1;page.locator('#screenDetailClose').click()
  page.locator('#stampBoardOpenBtn').click();assert page.locator('#screenDetail .stamp-help').evaluate('(e)=>e.open');page.locator('#screenDetailClose').click()
  if w==1280 and h==800:
   # No actual credentials/accounts: isolated synthetic local parent PIN only.
   page.locator('#parentBtn').click();page.locator('#modalFields input[type=password]').fill('0000');page.locator('[data-modal-ok]').click();page.wait_for_function("document.body.dataset.parent==='on'")
   page.locator('#wishDetailsBtn').click();page.locator('#screenDetail [data-act=wish-edit]').first.click();assert not page.locator('#screenDetail').evaluate('(e)=>e.open');assert page.locator('#modal').is_visible();page.keyboard.press('Escape')
   page.locator('#settingsBtn').click();page.locator('#familyPhotoInput').set_input_files('/downloads/single-1280x800.png');page.wait_for_function("document.querySelector('#photoSettingsStatus').textContent.includes('저장 완료')")
   # Bad formats and database aborts leave the saved album intact.
   page.locator('#familyPhotoInput').set_input_files({'name':'bad.txt','mimeType':'text/plain','buffer':b'not an image'})
   page.wait_for_function("document.querySelector('#photoSettingsStatus').textContent.includes('JPG')")
   assert page.locator('#familyPhotoCount').text_content()=='1 / 1'
   page.evaluate('''() => {const original=IDBObjectStore.prototype.put;window.restorePhotoPut=()=>{IDBObjectStore.prototype.put=original;};IDBObjectStore.prototype.put=function(){throw new DOMException('Synthetic quota failure','QuotaExceededError');};}''')
   page.locator('#familyPhotoInput').set_input_files('/downloads/single-1280x800.png')
   page.wait_for_function("document.querySelector('#photoSettingsStatus').textContent.includes('Synthetic quota failure')")
   assert page.locator('#familyPhotoCount').text_content()=='1 / 1'
   page.evaluate('restorePhotoPut()')
   page.evaluate('''async () => {await FamilyScreen.selectPhotos([new File(['invalid'],'test.png',{type:'image/png'})],()=>false);}''')
   assert '잠금 해제' in page.locator('#photoSettingsStatus').text_content()
   assert page.locator('#familyPhotoCount').text_content()=='1 / 1'
   page.keyboard.press('Escape');page.locator('#standbyBtn').click();assert page.locator('#familyPhoto').is_visible()
   page.wait_for_timeout(700);page.screenshot(path='/downloads/single-idle.png',full_page=True)
   for _ in range(3):page.locator('#familyPhotoNext').click()
   assert page.evaluate('FamilyDashboard.standby().on')
   page.locator('#standbyExit').click();assert not page.evaluate('FamilyDashboard.standby().on')
   page.locator('#settingsBtn').click();page.locator('#familyPhotoClear').click();page.wait_for_function("document.querySelector('#photoSettingsStatus').textContent.includes('지웠어요')");page.keyboard.press('Escape')
   page.locator('#parentBtn').click();assert page.locator('#familyPhotoSelect').is_hidden()
  assert page.evaluate('JSON.stringify(FamilyDashboard.state)')==initial_state,'display-only actions changed family records'
  assert not errors,(w,errors)
  print(w,h,geom,'paging and dialogs passed');page.close()
 b.close()
server.shutdown()
