import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

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
