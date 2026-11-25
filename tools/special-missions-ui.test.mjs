import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('approved special mission UI is loaded from the parent mission area', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(html, /special-missions\.css\?v=special-mission-20261126-2/);
  assert.match(html, /special-missions-core\.js\?v=special-mission-20261126-2/);
  assert.match(html, /class="[^"]*parent-only[^"]*" id="specialChoreAddBtn"/);
  assert.match(app, /specialChoreAddBtn'\)\.addEventListener\('click'.*특별 미션 추가는 보호자만/);
  assert.match(app, /async function addSpecialMission\(\)/);
  assert.match(app, /특별 미션 만들기/);
  assert.match(app, /돌림판 돌리기/);
  assert.match(app, /포켓몬은 자동으로 골라져요/);
  assert.match(app, /await specialMissionWait\(reduced \? 80 : 3350\);\s*spinning = false;\s*spinBtn\.textContent = '돌림판 완료';\s*hub\.textContent = points/);
});


test('tablet special card keeps status and points outside the content flow', () => {
  const css = read('special-missions.css');
  assert.match(css, /@media\(min-width:768px\)[\s\S]*\.special-mission-card \.mission-card-status[\s\S]*position: absolute !important/);
  assert.match(css, /@media\(min-width:768px\)[\s\S]*\.special-mission-card \.chore-top \.pts[\s\S]*right: 8px !important/);
  assert.match(css, /@media\(min-width:768px\)[\s\S]*\.special-mission-card \.chore-main[\s\S]*margin-bottom: 0 !important/);
});

test('special missions are today-only, child-owned, wheel-point missions with stored random art', () => {
  const app = read('app.js');
  assert.match(app, /missionAvailableToday[\s\S]*m\.special !== true \|\| !m\.specialDate \|\| m\.specialDate === date/);
  assert.match(app, /visibleMissions\(\)[\s\S]*missionAvailableToday\(m\)/);
  assert.match(app, /kidTodayGoal[\s\S]*missionAvailableToday\(m\) && missionOnDay/);
  assert.match(app, /special: true/);
  assert.match(app, /specialDate: today/);
  assert.match(app, /specialPolicyVersion: core\.POLICY_VERSION/);
  assert.match(app, /artSpecies,/);
  assert.match(app, /member: KID_ID/);
  assert.match(app, /due: ''/);
  assert.match(app, /오늘만 · 1회/);
  assert.match(app, /if \(c\.special === true && !isSpecialMissionToday\(c, t\)\) return;/);
});

test('special mission points cannot be edited through the regular mission form', () => {
  const app = read('app.js');
  assert.match(app, /if \(c\.special === true\) \{ await editSpecialMission\(c\); return; \}/);
  assert.match(app, /포인트 .*는 돌림판 결과 그대로 유지돼요\. 제목만 고칠 수 있어요/);
  const start = app.indexOf('async function editSpecialMission');
  const end = app.indexOf('async function editMission', start);
  const branch = app.slice(start, end);
  assert.match(branch, /c\.title = r\.title\.trim\(\)/);
  assert.doesNotMatch(branch, /c\.points =/);
  assert.doesNotMatch(branch, /c\.days =/);
});

test('special mission card preserves the stored Pokémon and special-first ordering', () => {
  const app = read('app.js');
  const art = read('mission-point-art.js');
  const selected = read('selected-dashboard.js');
  const integratedPatch = read('tools/integrated-dex-source.patch');
  assert.match(app, /storedArt > 0 \? storedArt : missionArtIds/);
  assert.match(art, /mission\.special===true&&stored>0/);
  assert.match(selected, /Number\(!special\.get\(a\.dataset\.id\)\)-Number\(!special\.get\(b\.dataset\.id\)\)/);
  assert.match(integratedPatch, /Number\(!isSpecialMissionToday\(a,t\)\)-Number\(!isSpecialMissionToday\(b,t\)\)/);
  assert.match(integratedPatch, /missionAvailableToday\(m\) && m\.member === KID_ID/);
});

test('generated live script contains the special mission implementation', () => {
  const active = read('app-dex-integrated.js');
  assert.match(active, /addSpecialMission/);
  assert.match(active, /special-mission-card/);
  assert.match(active, /특별 미션 만들기/);
  assert.match(active, /specialPolicyVersion/);
  assert.match(active, /missionAvailableToday/);
});
