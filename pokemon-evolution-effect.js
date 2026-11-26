/* Presentation only. Called by the existing successful evolution path. */
(function (root) {
  'use strict';
  const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
  let dialog, timers = [], previousFocus;
  const VIDEO = {전기:'electric',물:'water',불꽃:'fire',얼음:'ice',드래곤:'dragon',에스퍼:'psychic',고스트:'ghost'};
  const AUDIO = {전기:true,물:true};
  function mediaType(data){
    if(data.hatch || data.from.egg || Number(data.from.id)===Number(data.to.id))return '';
    const info=root.PokemonEncyclopediaData?.species||{};
    const to=data.to.types||info[data.to.id]?.types||[];
    const from=data.from.types||info[data.from.id]?.types||[];
    return [...to,...from].find(t=>VIDEO[t])||'';
  }
  const later = (fn, delay) => { timers.push(setTimeout(fn, delay)); };
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function close() {
    clearTimers();
    if (dialog) { const v=dialog.querySelector('video');if(v){v.pause();v.removeAttribute('src');v.load();} dialog.remove(); dialog = null; }
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
    const type=mediaType(data), cinematic=!!type&&!reduced;
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
    let movie;
    if(cinematic){
      dialog.classList.add('pe-cinematic');if(type==='불꽃')dialog.classList.add('pe-fire');
      movie=node('video','pe-type-video');movie.src=root.TypeEvolutionMedia?.[VIDEO[type]]||'';movie.muted=true;movie.autoplay=true;movie.playsInline=true;movie.preload='auto';movie.setAttribute('aria-hidden','true');
      art.prepend(movie);
      const mute=node('button','pe-audio','소리 켜기');mute.type='button';mute.addEventListener('click',()=>{movie.muted=!movie.muted;mute.textContent=movie.muted?'소리 켜기':'소리 끄기';});
      const skip=node('button','pe-skip','건너뛰기');skip.type='button';skip.addEventListener('click',()=>{reveal();movie.pause();skip.hidden=true;});
      button.textContent='닫기';if(AUDIO[type])card.append(mute);card.append(skip);
      movie.addEventListener('timeupdate',()=>{if(dialog!==current)return;const at=movie.currentTime;dialog.classList.toggle('pe-charging',at>=2.4&&at<3.25);if(at>=3.25)reveal();});
      movie.addEventListener('ended',reveal,{once:true});movie.addEventListener('error',()=>{reveal();movie.hidden=true;},{once:true});
      movie.play().catch(()=>{reveal();movie.hidden=true;});
    }
    dialog.addEventListener('click', e => { if (e.target === current || e.target === surface) close(); });
    document.body.append(dialog); dialog.showModal(); button.focus();
    function reveal() {
      if (dialog !== current || dialog.classList.contains('pe-revealed')) return;
      dialog.classList.add('pe-revealed');
      title.textContent = `${data.to.name} ${data.hatch ? '부화했어요!' : data.final ? '완성!' : '진화 완료!'}`;
      if (!reduced && !cinematic) {
        const confetti = node('div', 'pe-confetti'); confetti.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 24; i++) {
          const bit = node('i'); bit.style.setProperty('--x', `${(i * 43) % 100}%`);
          bit.style.setProperty('--delay', `${(i % 5) * .08}s`); bit.style.setProperty('--hue', String(i * 47)); confetti.append(bit);
        }
        surface.append(confetti);
      }
    }
    if (reduced) reveal(); else if(cinematic)later(reveal,7000);else later(reveal,1500);
    // Auto-return is bounded, with an always-available keyboard/touch exit.
    later(close, reduced ? 4500 : cinematic ? (type==='불꽃'?7000:12000) : 6000);
  }
  root.PokemonEvolutionEffect = Object.freeze({show, close, mediaType});
})(window);
