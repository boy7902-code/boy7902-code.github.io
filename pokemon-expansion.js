/* Read-only additional-generation browsing. Never reads or writes family state. */
(function(root) {
  'use strict';
  const data = root.PokemonExpansionData;
  if (!data || !Array.isArray(data.ids)) return;
  let dialog, returnFocus, query = '', page = 0;
  const pageSize = 20;
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  function close() {
    if (dialog) { dialog.remove(); dialog = null; }
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({preventScroll:true});
  }
  function open() {
    if (dialog) return;
    returnFocus = document.activeElement; query = ''; page = 0;
    dialog = make('dialog','pdx-dialog pdx-expansion');
    dialog.setAttribute('aria-labelledby','pdx-expansion-title');
    const header = make('header','pdx-detail-header');
    const title = make('h3','','다른 세대 도감'); title.id = 'pdx-expansion-title';
    const exit = make('button','pdx-exit','닫기'); exit.type = 'button'; exit.addEventListener('click',close);
    header.append(title,exit);
    const body = make('div','pdx-expansion-body');
    body.append(make('p','pdx-note','2세대 No.152~251 · 100종의 정보를 살펴봐요.'));
    body.append(make('p','pdx-expansion-boundary','정보를 보는 도감이에요. 새로 입양하거나 획득하는 목록은 아니며, 기존 151종 수집 기록과 경험치·보상은 그대로예요.'));
    const label = make('label','pdx-expansion-search','이름 또는 도감 번호');
    const input = make('input'); input.type = 'search'; input.placeholder = '예: 치코리타, 152';
    label.append(input); body.append(label);
    const status = make('p','pdx-note'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
    const grid = make('div','pdx-expansion-grid'); grid.setAttribute('aria-label','2세대 정보 목록');
    const pagination = make('nav','pdx-expansion-pages'); pagination.setAttribute('aria-label','다른 세대 도감 페이지');
    const previous = make('button','','이전'); previous.type = 'button';
    const counter = make('span');
    const next = make('button','','다음'); next.type = 'button';
    pagination.append(previous,counter,next); body.append(status,grid,pagination);
    const records = () => data.ids.map(id => root.PokemonEncyclopediaData.species[String(id)]).filter(Boolean);
    function render() {
      const q = query.trim().toLowerCase();
      const rows = records().filter(e => !q || e.name.includes(q) || String(e.id) === q || String(e.id).padStart(3,'0') === q || ('no'+e.id) === q);
      const totalPages = Math.max(1,Math.ceil(rows.length/pageSize)); page = Math.min(page,totalPages-1);
      grid.replaceChildren();
      status.textContent = rows.length ? `${rows.length}종 · ${page*pageSize+1}~${Math.min(rows.length,(page+1)*pageSize)}번째` : '찾는 포켓몬이 없어요.';
      rows.slice(page*pageSize,(page+1)*pageSize).forEach(e => {
        const card = make('button','pdx-expansion-card'); card.type = 'button'; card.dataset.infoSpecies = String(e.id);
        card.setAttribute('aria-label',`${e.name} No.${e.id} 정보 보기`);
        const image = make('img'); image.src = e.artworkUrl; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.width = 96; image.height = 96;
        image.addEventListener('error',()=>{ image.hidden = true; card.classList.add('pdx-art-unavailable'); },{once:true});
        card.append(make('span','pdx-note',`No.${String(e.id).padStart(3,'0')}`),image,make('b','',e.name),make('small','',e.types.join(' · ')));
        card.addEventListener('click',()=>root.PokemonEncyclopedia.show(e.id,{name:e.name,types:e.types,art:e.artworkUrl}));
        grid.append(card);
      });
      previous.disabled = page === 0; next.disabled = page >= totalPages-1; counter.textContent = `${page+1} / ${totalPages}`;
    }
    input.addEventListener('input',()=>{query=input.value;page=0;render();});
    previous.addEventListener('click',()=>{page--;render();}); next.addEventListener('click',()=>{page++;render();});
    dialog.append(header,body); dialog.addEventListener('keydown',e=>{if(e.key === 'Escape') e.stopPropagation();}); dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',e=>{if(e.target === dialog)close();});
    document.body.append(dialog); render(); dialog.showModal(); input.focus();
  }
  function mount() {
    const tools = document.querySelector('#dexModal .dex-tools');
    if (!tools || document.getElementById('pokemonExpansionOpen')) return;
    const button = make('button','btn sm ghost','다른 세대 도감 · 정보 보기'); button.type = 'button'; button.id = 'pokemonExpansionOpen';
    button.addEventListener('click',open); tools.after(button);
  }
  mount();
  root.PokemonExpansion = Object.freeze({open,close});
})(window);
