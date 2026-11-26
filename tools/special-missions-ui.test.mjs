import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('approved special mission UI is loaded from the parent mission area', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(html, /special-missions\.css\?v=special-mission-20261127-1/);
  assert.match(html, /special-missions-core\.js\?v=special-mission-20261127-1/);
  assert.match(html, /class="[^"]*parent-only[^"]*" id="specialChoreAddBtn"/);
  assert.match(app, /specialChoreAddBtn'\)\.addEventListener\('click'.*특별 미션 추가는 보호자만/);
  assert.match(app, /async function addSpecialMission\(\)/);
  assert.match(app, /특별 미션 만들기/);
  assert.match(app, /미션 이름만 적어 주세요\. 아이가 완료하면 포인트 돌림판이 나와요\. 포켓몬은 자동으로 골라져요/);
  const addBranch = app.slice(app.indexOf('async function addSpecialMission'), app.indexOf('async function editSpecialMission'));
  assert.doesNotMatch(addBranch, /special-spin-btn|special-wheel/);
  assert.match(addBranch, /points: 0/);
  assert.match(addBranch, /특별 미션을 줬어요 · 완료하면 아이가 돌림판을 돌려요 · 오늘만 1회/);
});


test('gold special card style wins over the dashboard default white card', () => {
  const css = read('special-missions.css');
  assert.match(css, /\.dashboard-refresh #cardChores \.chore\.special-mission-card[\s\S]*rgba\(255, 247, 216/);
  assert.match(css, /\.dashboard-refresh #cardChores \.chore\.special-mission-card\.done[\s\S]*rgba\(231, 255, 241/);
});

test('tablet special card keeps status and points outside the content flow', () => {
  const css = read('special-missions.css');
  assert.match(css, /@media\(min-width:768px\)[\s\S]*\.special-mission-card \.mission-card-status[\s\S]*position: absolute !important/);
  assert.match(css, /@media\(min-width:768px\)[\s\S]*\.special-mission-card \.chore-top \.pts[\s\S]*right: 8px !important/);
  assert.match(css, /@media\(min-width:768px\)[\s\S]*\.special-mission-card \.chore-main[\s\S]*margin-bottom: 0 !important/);
});

test('child spins the wheel after completing the special mission', () => {
  const app = read('app.js');
  assert.match(app, /if \(c\.special === true && basePtsOf\(c\) === 0\) \{ spinSpecialMission\(c\); return; \}/);
  assert.match(app, /function spinSpecialMission\(c\)/);
  assert.match(app, /특별 미션 완료!/);
  assert.match(app, /돌림판 돌리기/);
  assert.match(app, /points = core\.pickPoints\(\)/);
  assert.match(app, /c\.points = points;[\s\S]*toggleMission\(c\.id\)/);
  assert.match(app, /\+\?P/);
  const card = app.slice(app.indexOf('function choreCardHtml'), app.indexOf('function renderMissions'));
  assert.doesNotMatch(card, /special-tag|✦ 특별 미션/);
  assert.match(card, /완료하면 돌림판!/);
  const spin = app.slice(app.indexOf('function spinSpecialMission'), app.indexOf('async function addSpecialMission'));
  assert.match(spin, /오늘의 결과를 미션에 새겨 둡니다\. 완료를 취소했다 다시 완료해도 같은 포인트를 받고 돌림판은 다시 돌리지 않아요/);
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
  assert.match(app, /아이가 완료하면 돌림판으로 포인트를 정해요\. 제목만 고칠 수 있어요/);
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
  assert.match(active, /spinSpecialMission/);
  assert.match(active, /특별 미션 완료!/);
  assert.match(active, /special-mission-card/);
  assert.match(active, /특별 미션 만들기/);
  assert.match(active, /specialPolicyVersion/);
  assert.match(active, /missionAvailableToday/);
  assert.doesNotMatch(active, /special-tag|부모가 직접 정해요/);
});
