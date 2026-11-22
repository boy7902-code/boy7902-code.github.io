/* Praise gift UI. All awards go through the atomic server-backed adapter. */
(function (root) {
  'use strict';
  const core = root.FamilyPraiseCore;
  let adapter = null, context = { connected: false, role: '', kid: '아이' }, gifts = [], dialog = null, view = 'inbox', selected = '', busy = false, epoch = 0;
  let draft = null, notice = '', arrivalTimer = null, bodyOverflow = null;
  const ownIssued = new Set(), seen = new Set();
  const $ = selector => document.querySelector(selector);
  function node(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function action(text, fn, cls = 'pg-button') { const b = node('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function ctx() { return adapter?.getContext?.() || context; }
  function identity() { return ctx().identity || 'family'; }
  function draftKey() { return 'family-dashboard:praise-draft:' + identity(); }
  function seenKey() { return 'family-dashboard:praise-seen:' + identity(); }
  function saveDraft() { try { sessionStorage.setItem(draftKey(), JSON.stringify(draft)); } catch (e) {} }
  function loadDraft() { if (draft) return; try { const d = JSON.parse(sessionStorage.getItem(draftKey()) || 'null'); if (d && core.giftIdOk(d.id) && typeof d.reason === 'string') draft = d; } catch (e) {} }
  function remember(id) { seen.add(id); try { localStorage.setItem(seenKey(), JSON.stringify([...seen].slice(-200))); } catch (e) {} }
  function gift() { return gifts.find(g => g.id === selected); }
  function stampMillis(g) { return Number(g.createdAt?.seconds || 0) * 1000 + Number(g.createdAt?.nanoseconds || 0) / 1e6; }
  function sorted() { return gifts.slice().sort((a, b) => (a.state === 'ready' ? 0 : 1) - (b.state === 'ready' ? 0 : 1) || stampMillis(b) - stampMillis(a)); }
  function pending() { return gifts.filter(g => g.state === 'ready'); }
  function launcher() {
    const button = $('#praiseGiftBtn'); if (!button) return;
    const on = context.connected && (context.role === 'parent' || gifts.length > 0);
    button.hidden = !on;
    button.textContent = pending().length ? `칭찬 선물 ${pending().length}` : '칭찬 선물';
    button.classList.toggle('pg-has-gift', pending().length > 0);
    button.setAttribute('aria-label', pending().length ? `열지 않은 칭찬 선물 ${pending().length}개` : '칭찬 선물함');
    button.onclick = () => openInbox();
  }
  function ensure() {
    if (dialog) return;
    dialog = node('dialog', 'pg-dialog'); dialog.id = 'praiseGiftDialog'; dialog.setAttribute('aria-labelledby', 'pgTitle');
    document.body.append(dialog);
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.addEventListener('close', () => { if (selected) remember(selected); if (bodyOverflow !== null) { document.body.style.overflow = bodyOverflow; bodyOverflow = null; } });
    dialog.addEventListener('keydown', e => e.stopPropagation());
    dialog.addEventListener('click', e => { if (e.target === dialog && !busy) close(); });
  }
  function close() { if (busy) return; if (selected) remember(selected); dialog?.close(); }
  function show() { ensure(); render(); if (!dialog.open) { bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; dialog.showModal(); } }
  function header(title, eyebrow = '칭찬 선물') {
    const h = node('header', 'pg-head'); h.append(node('span', 'pg-eyebrow', eyebrow));
    const titleEl = node('h2', '', title); titleEl.id = 'pgTitle'; h.append(titleEl);
    const x = action('×', close, 'pg-close'); x.setAttribute('aria-label', '칭찬 선물 닫기'); x.disabled = busy; h.append(x); return h;
  }
  const giftSVG = '<svg viewBox="0 0 260 245" aria-hidden="true"><ellipse cx="130" cy="225" rx="90" ry="13" fill="#eadbc0"/><rect x="54" y="100" width="154" height="119" rx="14" fill="#e8b978"/><path d="M128 99h30v120h-30z" fill="#be6b68"/><rect x="42" y="78" width="178" height="45" rx="10" fill="#f4ce91"/><path d="M126 78h32v45h-32z" fill="#d58b7d"/><path d="M142 78C101 77 70 57 84 35c16-24 47 1 58 43Z" fill="#df9d8f" stroke="#b9766b" stroke-width="7"/><path d="M142 78c39-5 65-22 55-43-13-23-43 2-55 43Z" fill="#df9d8f" stroke="#b9766b" stroke-width="7"/><path d="m27 56 5 12 13 2-11 7-1 14-9-10-13 3 7-12-5-12 13 2Z" fill="#e6bd6e"/></svg>';
  function render() {
    ensure(); dialog.replaceChildren();
    const body = node('div', 'pg-body'); dialog.append(body);
    if (view === 'compose') return compose(body);
    if (view === 'gift') return showGift(body);
    if (view === 'wheel') return showWheel(body);
    if (view === 'result') return result(body);
    body.append(header('칭찬 선물함'));
    if (context.role === 'parent') body.append(action('칭찬 선물 보내기', () => { notice = ''; loadDraft(); if (!draft) { draft = { id: core.newId(), reason: '' }; saveDraft(); } view = 'compose'; show(); }));
    if (!gifts.length) body.append(node('p', 'pg-quiet', context.role === 'parent' ? '잘한 일을 발견했을 때 칭찬 한마디와 선물을 보내 주세요.' : '부모님이 보내 준 칭찬 선물이 여기에 도착해요.'));
    const list = node('div', 'pg-list');
    sorted().slice(0, 40).forEach(g => {
      const b = action('', () => { selected = g.id; notice = ''; view = g.state === 'claimed' ? 'result' : 'gift'; remember(g.id); show(); }, 'pg-list-item');
      b.append(node('span', 'pg-list-icon', g.state === 'claimed' ? '✓' : '🎁'), node('span', 'pg-list-reason', g.reason), node('span', 'pg-list-state', g.state === 'claimed' ? `받은 선물 +${g.points}P` : '열어 보기')); list.append(b);
    }); body.append(list);
    if (gifts.length > 40) body.append(node('p', 'pg-fine', '열지 않은 선물부터 최근 40개를 보여요.'));
  }
  function compose(body) {
    body.append(header('칭찬을 선물로 보내요', '부모 전용'));
    body.append(node('p', 'pg-quiet', `${context.kid}에게 선물 한 개를 보내요. 보낼 때마다 부모 PIN을 확인해요.`));
    const label = node('label', 'pg-label', '칭찬 한마디'); label.htmlFor = 'pgReason'; body.append(label);
    const input = node('textarea', 'pg-input'); input.id = 'pgReason'; input.maxLength = 40; input.rows = 3; input.placeholder = '예: 스스로 정리를 도와줘서 고마워!'; input.value = draft?.reason || '';
    input.addEventListener('input', () => { draft.reason = input.value; saveDraft(); }); body.append(input);
    const odds = node('p', 'pg-odds'); odds.textContent = core.POLICY.rewards.map(r => `${r.points}P`).join(' · '); body.append(odds);
    body.append(node('p', 'pg-fine', '꽝 없음 · 선물 하나당 한 번 · 별도 하루/주간 제한 없음'));
    if (notice) { const n = node('p', 'pg-error', notice); n.setAttribute('role', 'status'); body.append(n); }
    body.append(action('부모 확인 후 선물 보내기', send));
    body.append(action('선물함으로', () => { view = 'inbox'; show(); }, 'pg-text-button'));
  }
  async function send() {
    if (busy || !draft || !ctx().connected || ctx().role !== 'parent') return;
    draft.reason = String($('#pgReason')?.value || draft.reason || '').trim(); saveDraft();
    if (!draft.reason) { notice = '어떤 일을 칭찬하는지 적어 주세요.'; return render(); }
    if (!core.validatePolicy(ctx().policy || core.POLICY)) { notice = '칭찬 선물 설정을 준비 중이에요.'; return render(); }
    const token = epoch, request = { ...draft }; busy = true; ownIssued.add(request.id); dialog.close();
    let response;
    try { response = await adapter.send(request); } catch (e) { response = { ok: false, error: { message: '연결을 확인해 주세요. 다시 누르면 같은 선물의 전송을 확인해요.' } }; }
    if (token !== epoch) return;
    busy = false;
    if (response?.ok) {
      try { sessionStorage.removeItem(draftKey()); } catch (e) {} draft = null; view = 'inbox'; notice = '';
      remember(request.id); adapter.toast?.('칭찬 선물을 보냈어요. 아이 화면에서 열 수 있어요.', true);
    } else {
      view = 'compose'; notice = response?.cancelled ? '' : response?.error?.message || '선물을 보내지 못했어요. 같은 선물로 다시 시도해 주세요.'; show();
    }
    launcher();
  }
  function showGift(body) {
    const g = gift(); if (!g) { view = 'inbox'; return render(); }
    if (g.state === 'claimed') { view = 'result'; return render(); }
    body.append(header(`${context.kid}에게 선물이 왔어!`, '부모님이 보낸 칭찬'));
    const art = node('div', 'pg-gift-art'); art.innerHTML = giftSVG; body.append(art);
    body.append(node('p', 'pg-reason', g.reason));
    body.append(action('선물 열어 보기', () => { view = 'wheel'; notice = ''; render(); }));
    body.append(node('p', 'pg-fine', '지금 못 열어도 선물함에 남아 있어.'));
  }
  function wheelSector(index) {
    const degrees = 360 / core.POLICY.rewards.length;
    return { start: -90 + index * degrees, end: -90 + (index + 1) * degrees, target: (360 - (index + 0.5) * degrees + 360) % 360 };
  }
  function wheelGraphic() {
    const ns = 'http://www.w3.org/2000/svg', box = node('div', 'pg-wheel-box'), wheel = document.createElementNS(ns, 'svg');
    wheel.setAttribute('viewBox', '0 0 400 400'); wheel.classList.add('pg-wheel'); wheel.setAttribute('aria-hidden', 'true');
    const colors = ['#f3d791', '#dce7cb', '#ebcfb0', '#b9d4c4', '#d6957c'];
    core.POLICY.rewards.forEach((row, i) => {
      const { start, end } = wheelSector(i), a = start * Math.PI / 180, b = end * Math.PI / 180;
      const p = document.createElementNS(ns, 'path'); p.setAttribute('d', `M200 200L${200 + 184 * Math.cos(a)} ${200 + 184 * Math.sin(a)}A184 184 0 ${end - start > 180 ? 1 : 0} 1 ${200 + 184 * Math.cos(b)} ${200 + 184 * Math.sin(b)}Z`); p.setAttribute('fill', colors[i]); p.setAttribute('stroke', '#fff8e8'); p.setAttribute('stroke-width', '2'); wheel.append(p);
      const mid = (a + b) / 2, tx = document.createElementNS(ns, 'text'); tx.setAttribute('x', 200 + 133 * Math.cos(mid)); tx.setAttribute('y', 209 + 133 * Math.sin(mid)); tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('font-size', '27'); tx.setAttribute('font-weight', '800'); tx.setAttribute('fill', '#715333'); tx.textContent = `${row.points}P`; wheel.append(tx);
    });
    wheel.insertAdjacentHTML('beforeend', '<circle cx="200" cy="200" r="185" fill="none" stroke="#c6a16a" stroke-width="10"/><circle cx="200" cy="200" r="34" fill="#fff8e6" stroke="#c6a16a" stroke-width="6"/>');
    box.append(wheel, node('i', 'pg-pointer')); return box;
  }
  function showWheel(body) {
    const g = gift(); if (!g) { view = 'inbox'; return render(); }
    if (g.state === 'claimed' && !busy) { view = 'result'; return render(); }
    body.append(header('어떤 칭찬 점수가 나올까?', '선물 안의 돌림판'));
    body.append(node('p', 'pg-quiet', '이 선물로 한 번만 돌릴 수 있어.')); body.append(wheelGraphic());
    const odds = node('div', 'pg-legend'); core.POLICY.rewards.forEach((r, i) => { const e = node('span', `pg-legend-${i}`, `${r.points}P`); odds.append(e); }); body.append(odds);
    if (notice) { const n = node('p', 'pg-error', notice); n.setAttribute('role', 'status'); body.append(n); }
    const button = action(busy ? '선물을 확인하는 중…' : '한 번 돌리기', spin); button.disabled = busy; body.append(button);
    body.append(node('p', 'pg-fine', busy ? '확인 중에는 다시 누를 수 없어.' : '포인트 차감이나 꽝, 재추첨은 없어.'));
  }
  async function spin() {
    const g = gift(); if (busy || !g || !ctx().connected) return;
    const token = epoch; selected = g.id; busy = true; notice = ''; render();
    const rotating = $('.pg-wheel'); rotating?.classList.add('pg-awaiting');
    let response;
    try { response = await adapter.claim({ id: g.id }); } catch (e) { response = { ok: false, error: { message: '저장을 확인하지 못했어. 연결 후 같은 선물로 다시 확인해 줘.' } }; }
    if (token !== epoch) return;
    if (!response?.ok) { busy = false; rotating?.classList.remove('pg-awaiting'); notice = response?.cancelled ? '연결 상태를 확인한 뒤 같은 선물을 열어 줘.' : response?.error?.message || '연결을 확인하고 다시 눌러 줘. 새로 추첨하지 않아.'; render(); return; }
    let target = 0; core.POLICY.rewards.forEach((r, i) => { if (r.points === response.points) target = wheelSector(i).target; });
    const reduced = root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let currentAngle = 0;
    if (rotating) { const m = new DOMMatrixReadOnly(getComputedStyle(rotating).transform); currentAngle = (Math.atan2(m.b, m.a) * 180 / Math.PI + 360) % 360; rotating.classList.remove('pg-awaiting'); rotating.style.transform = `rotate(${currentAngle}deg)`; }
    const end = currentAngle + 1800 + (target - currentAngle + 360) % 360;
    if (rotating) { if (!reduced && !response.alreadyClaimed) { rotating.getBoundingClientRect(); rotating.style.transition = 'transform 3.7s cubic-bezier(.15,.7,.15,1)'; } rotating.style.transform = `rotate(${end}deg)`; }
    await new Promise(resolve => setTimeout(resolve, reduced || response.alreadyClaimed ? 100 : 3800));
    if (token !== epoch) return;
    // A receipt returned by the transaction is the source, never a guessed local award.
    gifts = gifts.map(x => x.id === g.id ? { ...x, state: 'claimed', points: response.points } : x);
    busy = false; view = 'result'; remember(g.id); render(); launcher();
  }
  function result(body) {
    const g = gift(); if (!g || g.state !== 'claimed') { view = 'inbox'; return render(); }
    body.append(header(`${context.kid}, 정말 잘했어!`, '받은 칭찬 선물'));
    body.append(node('p', 'pg-reason', g.reason)); body.append(node('div', 'pg-reward', `+${g.points}P`));
    const rows = node('div', 'pg-result-rows'); ['누적 경험치', '선물에 쓸 수 있는 포인트'].forEach(label => { const row = node('div'); row.append(node('span', '', label), node('b', '', `+${g.points}P`)); rows.append(row); });
    rows.append(node('p', 'pg-fine', '두 가지 표시, 같은 점수를 반영해요.')); body.append(rows);
    body.append(node('p', 'pg-once', '이 선물은 한 번만 받았어. 다시 열어도 결과와 적립은 그대로야.'));
    body.append(action('고마워!', close)); body.append(action('선물함 보기', () => { view = 'inbox'; render(); }, 'pg-text-button'));
  }
  function maybeArrival() {
    clearTimeout(arrivalTimer); arrivalTimer = null;
    if (!context.connected || document.hidden || busy || dialog?.open) return;
    const next = sorted().find(g => g.state === 'ready' && !seen.has(g.id) && !ownIssued.has(g.id));
    if (!next) return;
    arrivalTimer = setTimeout(() => {
      if (!context.connected || document.hidden || busy || dialog?.open) return;
      // Do not cover another open dialog or an active PIN/input operation.
      if ([...document.querySelectorAll('dialog[open],.modal:not([hidden])')].some(e => e !== dialog && e.getClientRects().length)) return;
      selected = next.id; view = 'gift'; remember(next.id); show();
    }, 600);
  }
  function observe(next) {
    context = { ...context, ...next }; gifts = (next.gifts || []).filter(core.validGift);
    try { JSON.parse(localStorage.getItem(seenKey()) || '[]').forEach(id => seen.add(id)); } catch (e) {}
    launcher(); if (dialog?.open && !busy && view === 'inbox') render();
    // An independent device may have consumed the selected gift already.
    if (dialog?.open && !busy && ['gift', 'wheel'].includes(view) && gift()?.state === 'claimed') { view = 'result'; render(); }
    maybeArrival();
  }
  function openInbox() { if (!context.connected || busy) return; selected = ''; view = 'inbox'; notice = ''; show(); }
  function reset() { epoch++; busy = false; gifts = []; context = { connected: false, role: '', kid: '아이' }; draft = null; selected = ''; notice = ''; ownIssued.clear(); seen.clear(); clearTimeout(arrivalTimer); dialog?.close(); launcher(); }
  root.FamilyPraise = Object.freeze({ configure: value => { adapter = value; launcher(); }, observe, reset, openInbox, status: () => ({ busy, pending: pending().length, open: !!dialog?.open }) });
  document.addEventListener('click', () => { if (!dialog?.open && !busy) maybeArrival(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeArrival(); });
})(globalThis);
