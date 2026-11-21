/* Read-only encyclopedia presentation. No rewards, catches or partner state. */
(function(root) {
  'use strict';
  function element(tag, cls, text) {
    const node = document.createElement(tag); if (cls) node.className = cls;
    if (text != null) node.textContent = text; return node;
  }
  function sourceLink(source, label) {
    if (!source || !source.url) return null;
    let url; try { url = new URL(source.url); } catch (_) { return null; }
    if (url.protocol !== 'https:') return null;
    const a = element('a', '', label || source.label || url.hostname);
    a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }
  function valueRow(list, label, value) {
    list.append(element('dt', '', label), element('dd', '', value == null || value === '' ? '자료 확인 중' : String(value)));
  }
  function renderFacts(mount, id) {
    if (!mount) return;
    mount.replaceChildren();
    const dataset = root.PokemonEncyclopediaData;
    const entry = dataset && dataset.species && dataset.species[String(id)];
    const section = element('section', 'pdx-information'); section.setAttribute('aria-label', '포켓몬 자체 정보');
    const title = element('h4', '', '포켓몬 기본 정보'); section.append(title);
    if (!entry) {
      section.append(element('p', 'pdx-note', '이 포켓몬의 상세 정보는 확인 중이에요.'));
      mount.append(section); return;
    }
    const base = element('dl', 'pdx-facts');
    valueRow(base, '분류', entry.genus);
    valueRow(base, '키', Number.isFinite(entry.heightM) ? `${entry.heightM}m` : null);
    valueRow(base, '몸무게', Number.isFinite(entry.weightKg) ? `${entry.weightKg}kg` : null);
    const abilities = Array.isArray(entry.abilities) ? entry.abilities : [];
    valueRow(base, '특성', abilities.filter(a => !a.hidden).map(a => a.name).join(' · '));
    section.append(base);
    const hidden = abilities.filter(a => a.hidden);
    if (hidden.length) {
      const detail = element('details', 'pdx-optional'); detail.append(element('summary', '', '숨겨진 특성 (보조 자료)'));
      detail.append(element('p', '', hidden.map(a => a.name).join(' · ')));
      detail.append(element('p', 'pdx-note', '공식 도감에 표시되지 않은 보조 출처 정보예요.'));
      section.append(detail);
    }
    if (entry.description && entry.description.text) {
      const text = element('div', 'pdx-description');
      text.append(element('h4', '', `도감 설명${entry.description.version ? ` · ${(dataset.versionLabelLegend || {})[entry.description.version] || entry.description.version}` : ''}`));
      text.append(element('p', '', entry.description.text)); section.append(text);
    }
    const evolution = Array.isArray(entry.evolution) ? entry.evolution : [];
    if (evolution.length) {
      const block = element('div', 'pdx-natural-evolution');
      block.append(element('h4', '', '같은 진화 계열'));
      block.append(element('p', 'pdx-note', '아래는 포켓몬 정보예요. 이 앱에서 자라는 경험치 조건과는 달라요.'));
      const list = element('ul', 'pdx-evolution-list');
      evolution.forEach(stage => {
        const item = element('li');
        const art = element('img');art.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/'+Number(stage.id)+'.png';art.alt='';art.loading='lazy';art.width=64;art.height=64;art.addEventListener('error',()=>{art.hidden=true;const fallback=element('span','pdx-image-fallback',String(stage.name || '?').slice(0,1));fallback.setAttribute('aria-label','그림을 불러오지 못했어요');art.after(fallback);},{once:true});
        item.append(art,element('b', '', stage.name));
        if (stage.types && stage.types.length) item.append(element('span', '', stage.types.join(' · ')));
        list.append(item);
      });
      block.append(list); section.append(block);
    } else { section.append(element('p','pdx-note','표시된 다른 진화 계열이 없어요.')); }
    if (Array.isArray(entry.sources) && entry.sources.length) {
      const provenance = element('details', 'pdx-sources'); provenance.append(element('summary', '', '정보 출처'));
      const list = element('ul');
      entry.sources.forEach(s => { const a = sourceLink(s); if (!a) return; const li = element('li');li.append(a);if(s.fields)li.append(document.createTextNode(` · ${Array.isArray(s.fields) ? s.fields.map(fieldLabel).join(' · ') : s.fields}`));list.append(li); });
      provenance.append(list);
      if (entry.checkedAt) provenance.append(element('p', 'pdx-note', `자료 확인: ${String(entry.checkedAt).slice(0,10)}`));
      section.append(provenance);
    }
    mount.append(section);
  }
  function fieldLabel(value) {
    const labels = {name:'이름',genus:'분류',heightM:'키',weightKg:'몸무게',types:'타입',description:'설명',evolution:'진화 관계'};
    return labels[value] || String(value).replace(/^abilities/, '특성');
  }
  let activeDialog, returnFocus;
  function close() {
    if (activeDialog) { activeDialog.remove(); activeDialog = null; }
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({preventScroll:true});
  }
  function show(id, basic = {}) {
    const entry = root.PokemonEncyclopediaData && root.PokemonEncyclopediaData.species[String(id)];
    if (!entry && !basic.name) return;
    close(); returnFocus = document.activeElement;
    const dialog = element('dialog','pdx-dialog'); activeDialog = dialog;
    dialog.setAttribute('aria-labelledby','pdx-detail-title');
    const header = element('header','pdx-detail-header');
    const heading = element('h3','','포켓몬 상세 정보'); heading.id = 'pdx-detail-title';
    const exit = element('button','pdx-exit','닫기');exit.type='button';exit.addEventListener('click',close);header.append(heading,exit);
    const body = element('div','pdx-detail-body'); const hero = element('div','pdx-detail-hero');
    hero.append(element('p','pdx-detail-number',`도감 No.${String((entry && entry.nationalDexId) || id).padStart(3,'0')}${entry && entry.displayForm ? ' · '+entry.displayForm : ''}`),element('h2','',(entry && entry.name) || basic.name));
    const img = element('img','pdx-detail-art');img.src=basic.art;img.alt=(entry && entry.name) || basic.name;img.decoding='async';img.addEventListener('error',()=>{img.hidden=true;const fallback=element('p','pdx-image-fallback pdx-image-large','그림을 불러오지 못했어요');img.after(fallback);},{once:true});hero.append(img);
    hero.append(element('p','pdx-detail-types',((entry && entry.types) || basic.types || []).join(' · ')));
    const facts = element('div'); renderFacts(facts,id);body.append(hero,facts);dialog.append(header,body);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
    document.body.append(dialog);dialog.showModal();exit.focus();
  }
  function render(mount,id,basic={}) {
    if(!mount)return;mount.replaceChildren();
    const entry=root.PokemonEncyclopediaData && root.PokemonEncyclopediaData.species[String(id)];
    const block=element('div','pdx-detail-entry');
    if(entry){
      const button=element('button','pdx-open','도감 정보 자세히 보기');button.textContent='도감 정보 자세히 보기';button.type='button';
      button.addEventListener('click',()=>show(id,basic));block.append(button);
      block.append(element('p','pdx-note','분류 · 키 · 몸무게 · 특성 · 설명 · 진화 관계'));
    }else block.append(element('p','pdx-note','이 포켓몬의 상세 정보는 확인 중이에요.'));
    mount.append(block);
  }
  root.PokemonEncyclopedia = Object.freeze({render,show,close});
})(window);
