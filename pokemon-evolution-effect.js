/* Presentation only. Called by the existing successful evolution path. */
(function (root) {
  'use strict';
  const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
  let dialog, timers = [], previousFocus;
  const later = (fn, delay) => { timers.push(setTimeout(fn, delay)); };
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function close() {
    clearTimers();
    if (dialog) { dialog.remove(); dialog = null; }
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({preventScroll:true});
  }
  function node(tag, cls, text) {
    const el = document.createElement(tag); if (cls) el.className = cls;
    if (text != null) el.textContent = text; return el;
  }
  function picture(stage, cls) {
    if(stage.egg){const egg=node('span','partner-egg '+cls);egg.setAttribute('role','img');egg.setAttribute('aria-label','새 파트너 알');return egg;}
    const img = node('img', cls); img.alt = stage.name || '포켓몬';
    img.src = ART + (stage.shiny ? 'shiny/' : '') + Number(stage.id) + '.png'; img.decoding = 'async';
    img.addEventListener('error', () => {
      img.hidden = true;
      const fallback = node('span', 'pe-fallback', '✦'); fallback.setAttribute('aria-hidden', 'true');
      img.after(fallback);
    }, {once:true});
    return img;
  }
  function show(data) {
    if (!data || !data.from || !data.to || !(Number(data.to.id) > 0)) return;
    close(); previousFocus = document.activeElement;
    const reduced = root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    dialog = node('dialog', 'pe-dialog');
    dialog.setAttribute('aria-labelledby', 'pe-title');
    dialog.setAttribute('aria-describedby', 'pe-description');
    const surface = node('div', 'pe-surface');
    const rays = node('div', 'pe-rays'); rays.setAttribute('aria-hidden', 'true');
    const card = node('section', 'pe-stage-card');
    const badge = node('span', 'pe-badge', data.hatch ? '새 파트너의 첫 만남' : data.final ? '파트너 성장 완료' : '진화의 순간');
    const title = node('h2', '', reduced ? `${data.to.name} ${data.hatch ? '부화했어요!' : data.final ? '완성!' : '진화 완료!'}` : `${data.from.name}, 빛이 모이고 있어요`); title.id = 'pe-title';
    const art = node('div', 'pe-art');
    const before = picture(data.from, 'pe-before');
    const after = picture(data.to, 'pe-after');
    if (data.to.shiny) after.classList.add('pe-shiny');
    art.append(before, after);
    const description = node('p', 'pe-description', `파트너 경험치 ${Math.max(0, Math.round(Number(data.xp) || 0))}P`); description.id = 'pe-description';
    const note = node('p', 'pe-note', data.final ? '완성한 파트너는 기존 도감에 남아요' : '함께 차곡차곡 자라고 있어요');
    const button = node('button', 'pe-close', '계속하기'); button.type = 'button'; button.addEventListener('click', close);
    const info=node('button','pe-info',`${data.to.name} 정보 보기`);info.type='button';
    info.addEventListener('click',()=>{const stage=data.to;close();if(root.PokemonEncyclopedia)root.PokemonEncyclopedia.show(stage.id,{name:stage.name,art:ART+(stage.shiny?'shiny/':'')+Number(stage.id)+'.png'});});
    card.append(badge, title, art, description, note, info, button);
    surface.append(rays, card); dialog.append(surface);
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    const current = dialog;
    dialog.addEventListener('click', e => { if (e.target === current || e.target === surface) close(); });
    document.body.append(dialog); dialog.showModal(); button.focus();
    function reveal() {
      if (dialog !== current) return;
      dialog.classList.add('pe-revealed');
      title.textContent = `${data.to.name} ${data.hatch ? '부화했어요!' : data.final ? '완성!' : '진화 완료!'}`;
      if (!reduced) {
        const confetti = node('div', 'pe-confetti'); confetti.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 24; i++) {
          const bit = node('i'); bit.style.setProperty('--x', `${(i * 43) % 100}%`);
          bit.style.setProperty('--delay', `${(i % 5) * .08}s`); bit.style.setProperty('--hue', String(i * 47)); confetti.append(bit);
        }
        surface.append(confetti);
      }
    }
    if (reduced) reveal(); else later(reveal, 1500);
    // Auto-return is bounded, with an always-available keyboard/touch exit.
    later(close, reduced ? 4500 : 6000);
  }
  root.PokemonEvolutionEffect = Object.freeze({show, close});
})(window);
