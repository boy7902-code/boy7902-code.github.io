import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('mission row toggles completion while nested edit/delete keep their own actions', () => {
  assert.match(app, /<div class="chore[^\n]*data-act="chore-toggle" data-id="\$\{c\.id\}"/);
  assert.match(app, /data-act="chore-edit" data-id="\$\{c\.id\}"/);
  assert.match(app, /data-act="chore-del" data-id="\$\{c\.id\}"/);
  assert.match(app, /e\.target\.closest\('\.chore-tools'\) && !e\.target\.closest\('\.chore-tools \[data-act\]'\)/);
});

test('mission setup no longer exposes configurable legacy deadline bonus', () => {
  assert.doesNotMatch(app, /name: 'bonus', label: '시간 내 완료 보너스/);
  assert.doesNotMatch(app, /const bonusPtsOf/);
  assert.match(app, /MissionRewards\.calculateMissionReward/);
  assert.match(app, /earlyBonusEarned = r\.earlyBonus/);
});

test('confirmed dashboard mockup keeps the two-column cards and one-line time/weather header', () => {
  assert.match(html, /class="clock header-clock"/);
  assert.match(html, /class="weather topbar-weather" id="weather"/);
  assert.doesNotMatch(html, /class="overview-time"/);
  assert.match(html, /id="wTempCard"/);
  assert.match(html, /id="weatherWeek" aria-label="주간 날씨 예보"/);
  assert.match(html, /class="support-grid" id="supportCards"/);
  assert.match(html, /id="cardWish"/);
  const rightColumnStart = html.indexOf('class="col col-right"');
  const supportGridStart = html.indexOf('id="supportCards"');
  const timerIndex = html.indexOf('id="cardTimer"');
  assert.ok(timerIndex > rightColumnStart, 'timer belongs in the right column');
  assert.ok(timerIndex > html.indexOf('id="cardChores"'), 'timer follows the mission card');
  assert.doesNotMatch(html.slice(supportGridStart, rightColumnStart), /id="cardTimer"/);
  assert.match(html, /id="appVersion"[^>]*>v 3\.1\.0/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, \.96fr\) minmax\(0, 1\.04fr\)/);
  assert.match(css, /\.support-grid \{ order: 3; display: grid;/);
  assert.match(css, /grid-template-areas: "school wish"; grid-template-rows: minmax\(70px, 190px\)/);
  assert.match(css, /#cardSchool \.card-body \{ flex: 1 1 auto; min-height: 0; overflow: auto; \}/);
  assert.match(css, /#cardWish:not\(\.is-empty\) \.wish-list \{ max-height: 104px; overflow-y: auto; \}/);
  assert.match(css, /\.col-right > #cardTimer \{ flex: 0 0 120px; min-height: 120px; \}/);
  assert.match(css, /#cardTimer \{ order: 5; \}/);
  assert.match(css, /@media \(min-width: 1024px\) and \(max-height: 900px\)/);
  assert.match(css, /#cardWish:not\(\.is-empty\) \.wish-list \{ max-height: 72px; \}/);
  assert.match(css, /\.col-right > #cardTimer \{ flex-basis: 110px; min-height: 110px; \}/);
  assert.match(css, /#shopPane \{ display: none !important; \}/);
  assert.match(app, /if \(\$\('#wTempCard'\)\) \$\('#wTempCard'\)\.innerHTML = currentTemp/);
});

test('overdue unfinished missions are dimmed without changing mission reward calculations', () => {
  assert.match(app, /const overdue = !done && !offday && dueMin != null && nowMin != null && dueMin < nowMin/);
  assert.match(app, /overdue \? ' overdue' : ''/);
  assert.match(css, /\.chore\.overdue \{ opacity: \.56;/);
  assert.match(app, /MissionRewards\.calculateMissionReward/);
});

test('base and responsive mission checkbox rules all keep a 44px tap target', () => {
  const rules = css.match(/(?:^|\n)\s*(?:#cardChores\s+)?\.chore-check\s*\{[^}]*\}/g) || [];
  assert.ok(rules.length >= 5, `expected base and responsive checkbox rules, found ${rules.length}`);
  for (const rule of rules) {
    assert.match(rule, /width:\s*44px/, `checkbox rule shrank below 44px: ${rule}`);
    assert.match(rule, /height:\s*44px/, `checkbox rule height is below 44px: ${rule}`);
  }
  assert.match(css, /\.early-chip\s*\{/);
  assert.match(css, /\.done-badge\.early/);
  assert.match(css, /\.log-badge\.early/);
});

test('app version has one source and the overdue dim follows the clock', () => {
  assert.match(app, /const APP_VERSION = '(\d+\.\d+\.\d+)'/);
  const v = app.match(/const APP_VERSION = '(\d+\.\d+\.\d+)'/)[1];
  assert.ok(html.includes('id="appVersion" aria-label="앱 버전">v ' + v + '<'), 'index fallback text matches APP_VERSION');
  assert.match(app, /version: APP_VERSION,/);
  assert.match(app, /row\.classList\.toggle\('overdue', di\.cls === 'late'\)/);
  assert.doesNotMatch(html.slice(html.indexOf('id="weather"'), html.indexOf('</button>', html.indexOf('id="weather"'))), /<div/);
});

test('done badge shows how many minutes early a deadline mission was finished', () => {
  assert.match(app, /const ahead = dueM != null && doneM != null && dueM > doneM/);
  assert.match(app, /완료\$\{ahead \|\| ' · 마감 전 완료'\}/);
});
