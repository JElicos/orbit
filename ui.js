// 메뉴 화면: SETTINGS / RECORDS / ACHIEVEMENTS 탭
(() => {
  'use strict';
  const O = window.ORBIT, game = window.orbitGame;
  const ui = document.getElementById('ui');
  const panel = document.getElementById('panel');
  const body = document.getElementById('tabBody');
  const menuBtn = document.getElementById('menuBtn');
  const closeBtn = document.getElementById('closeBtn');
  const tabs = Array.from(panel.querySelectorAll('.tab'));
  let current = 'settings';

  // 메뉴를 게임 화면 위치와 크기에 맞춤
  function sync() {
    const c = game.canvas;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    ui.style.left = r.left + 'px';
    ui.style.top = r.top + 'px';
    ui.style.width = r.width + 'px';
    ui.style.height = r.height + 'px';
    ui.style.fontSize = (r.width / 540 * 18) + 'px';
    ui.style.visibility = 'visible';
  }
  game.events.once('ready', sync);
  game.scale.on('resize', sync);
  window.addEventListener('resize', () => setTimeout(sync, 50));
  setTimeout(sync, 300);

  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (ms) => {
    if (!ms) return '-';
    const d = new Date(ms);
    return pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  // 행성 번호를 "5.4 AU" 같은 거리 글자로
  const distText = (index) => O.formatAU(O.distanceAU(index)) + ' AU';

  // 스테이지 도전과제 설명: 어디까지 갔고 다음은 어디인지
  const stageSub = (lv) => {
    if (!lv) return 'Land on a planet to begin';
    const next = O.STAGES[lv];
    return 'Reached ' + O.STAGES[lv - 1].name + (next ? ' &middot; next: ' + next.name : ' &middot; MAX');
  };

  // 확인하지 않은 새 도전과제가 있으면 MENU 버튼과 ACHIEVEMENTS 탭에 점 표시
  function refreshBadge() {
    const on = O.getNum(O.KEY.newAch, 0) === 1;
    menuBtn.classList.toggle('has-new', on);
    tabs.forEach((t) => t.classList.toggle('has-new', on && t.dataset.tab === 'achievements'));
  }

  let pendingBuy = null;   // 구매 확인을 기다리는 항목 id
  let shopNote = '';       // 꾸미기 탭 위쪽 안내 문구

  // 궤적 미리보기: 점 여러 개로 각 궤적의 느낌을 표현(오른쪽이 공 쪽)
  function trailSwatch(id, ballColor) {
    const dot = (size, bg, extra) =>
      '<i style="width:' + size + 'em;height:' + size + 'em;background:' + bg + ';' + (extra || '') + '"></i>';
    let html = '';
    for (let i = 0; i < 6; i++) {
      const f = (i + 1) / 6, op = 'opacity:' + (0.25 + 0.75 * f).toFixed(2) + ';';
      if (id === 'trail_dots') html += dot(0.3, ballColor, op + 'margin:0 .14em;');
      else if (id === 'trail_ribbon') html += dot(0.5, ballColor, op + 'border-radius:0;width:.5em;height:' + (0.12 + 0.5 * f).toFixed(2) + 'em;margin:0;');
      else if (id === 'trail_spark') html += dot(i % 2 ? 0.2 : 0.34, i % 2 ? '#fff3c4' : ballColor, op + 'transform:translateY(' + (i % 2 ? -0.3 : 0.1) + 'em);');
      else if (id === 'trail_fire') html += dot(0.25 + 0.4 * f, f > 0.66 ? '#ffe27a' : f > 0.33 ? '#ff9a3c' : '#e0452a', op);
      else if (id === 'trail_rainbow') html += dot(0.25 + 0.35 * f, 'hsl(' + (i * 55) + ',85%,65%)', op);
      else if (id === 'trail_void') html += dot(0.25 + 0.4 * f, '#12061f', op + 'box-shadow:0 0 0 1.5px #b388ff;margin:0 .1em;');
      else html += dot(0.2 + 0.4 * f, ballColor, op);
    }
    return html + '<i class="ballsw small" style="background:' + ballColor + '"></i>';
  }

  const render = {
    customize() {
      const stars = O.getStars(), eq = O.getEquip();
      const card = (kind, it) => {
        const equipped = eq[kind].id === it.id;
        let status, cls;
        if (equipped) { status = 'EQUIPPED'; cls = 'equipped'; }
        else if (O.isUnlocked(it)) { status = 'OWNED'; cls = 'owned'; }
        else if (it.unlock) { status = O.achievement(it.unlock.ach).name + ' LV ' + it.unlock.level; cls = 'locked'; }
        else if (pendingBuy === it.id) { status = 'TAP TO BUY'; cls = 'confirm'; }
        else { status = '&#9733; ' + it.price; cls = stars >= it.price ? 'buyable' : 'poor'; }
        return '<button type="button" class="item ' + cls + '" data-kind="' + kind + '" data-item="' + it.id + '" tabindex="-1">' +
          '<span class="swatch">' + (kind === 'ball'
            ? '<i class="ballsw" style="background:' + it.color + '"></i>'
            : trailSwatch(it.id, eq.ball.color)) + '</span>' +
          '<span class="item-name">' + it.name + '</span>' +
          '<span class="item-status">' + status + '</span></button>';
      };
      body.innerHTML =
        '<div class="wallet"><span>YOUR STARS</span><b>&#9733; ' + stars + '</b></div>' +
        '<p class="shopnote">' + (shopNote || 'Tap an item to equip it. Tap a priced item twice to buy it.') + '</p>' +
        '<h2>BALL COLOR</h2><div class="grid">' + O.COSMETICS.ball.map((it) => card('ball', it)).join('') + '</div>' +
        '<h2>TRAIL</h2><div class="grid">' + O.COSMETICS.trail.map((it) => card('trail', it)).join('') + '</div>' +
        '<p class="note">Stars float between planets. Each one adds to your total, and big ringed stars are worth 5.</p>';
    },

    settings() {
      const lv = O.sfx.level, max = O.VOLUME_STEPS;
      let bars = '';
      for (let i = 1; i <= max; i++) bars += '<span class="vbar' + (i <= lv ? ' on' : '') + '" style="height:' + (0.6 + i * 0.32) + 'em"></span>';
      body.innerHTML =
        '<h2>SOUND VOLUME</h2>' +
        '<div class="vol">' +
          '<button type="button" class="step" data-vol="-1"' + (lv <= 0 ? ' disabled' : '') + '>&minus;</button>' +
          '<div class="vbars">' + bars + '</div>' +
          '<button type="button" class="step" data-vol="1"' + (lv >= max ? ' disabled' : '') + '>+</button>' +
        '</div>' +
        '<p class="vol-label">' + (lv === 0 ? 'OFF' : lv + ' / ' + max) + '</p>' +
        '<p class="note">Press M during play to mute or unmute quickly.</p>' +
        '<p class="note ver">VERSION ' + O.VERSION + '</p>';
    },

    records() {
      const h = O.loadHistory();
      let html =
        '<div class="bests">' +
          '<div><span>BEST SCORE</span><b>' + O.getNum(O.KEY.best, 0) + '</b></div>' +
          '<div><span>BEST COMBO</span><b>x' + O.getNum(O.KEY.bestCombo, 0) + '</b></div>' +
        '</div>' +
        '<div class="bests wide"><div><span>BEST DISTANCE</span><b>' + distText(O.getNum(O.KEY.bestDist, 0)) +
          '</b><em>' + O.STAGES[O.stageOf(O.getNum(O.KEY.bestDist, 0))].name + '</em></div></div>' +
        '<h2>LAST ' + O.HISTORY_MAX + ' RUNS</h2>';
      if (!h.length) {
        html += '<p class="note">No runs yet. Play a round and it will show up here.</p>';
      } else {
        html += '<table><thead><tr><th>#</th><th>SCORE</th><th>COMBO</th><th>DISTANCE</th><th>WHEN</th></tr></thead><tbody>';
        h.forEach((e, i) => {
          html += '<tr><td>' + (i + 1) + '</td><td class="num">' + e.score + '</td><td>x' + e.combo +
            '</td><td>' + (e.dist >= 0 ? distText(e.dist) : '-') + '</td><td class="dim">' + fmtDate(e.at) + '</td></tr>';
        });
        html += '</tbody></table>';
      }
      body.innerHTML = html;
    },

    achievements() {
      let html = '';
      for (const a of O.ACHIEVEMENTS) {
        const value = O.valueOf(a.id);
        const lv = O.tierOf(a.tiers, value);
        const next = a.tiers[lv];
        let segs = '';
        for (let i = 0; i < a.tiers.length; i++) {
          segs += '<span class="seg' + (i < lv ? ' on' : '') + '" title="LV ' + (i + 1) + ': ' + a.tiers[i] + '"></span>';
        }
        html +=
          '<div class="ach" style="--c:' + a.color + '">' +
            '<div class="ach-top"><span class="dot"></span><span class="ach-name">' + a.name + '</span>' +
              '<span class="ach-lv">LV ' + lv + ' / ' + a.tiers.length + '</span></div>' +
            '<div class="segs">' + segs + '</div>' +
            '<div class="ach-sub">' + (a.id === 'stage' ? stageSub(lv) :
              value + (next ? ' / ' + next : '') + ' ' + a.unit + (next ? '' : ' &middot; MAX')) + '</div>' +
          '</div>';
      }
      body.innerHTML = html;
    },
  };

  function show(tab) {
    if (tab !== current || tab !== 'customize') { pendingBuy = null; shopNote = ''; }
    current = tab;
    if (tab === 'achievements') O.setNum(O.KEY.newAch, 0);   // 탭을 열면 확인한 것으로 처리
    refreshBadge();
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    render[tab]();
    body.scrollTop = 0;
  }

  function blur() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  function open() {
    if (!panel.hidden) return;
    O.sfx.init();
    game.scene.pause('game');     // 메뉴가 열린 동안 게임 정지
    panel.hidden = false;
    menuBtn.hidden = true;
    show(current);
    blur();
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    menuBtn.hidden = false;
    game.scene.resume('game');
    blur();                        // 스페이스가 버튼을 누르지 않도록
  }

  menuBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  tabs.forEach((t) => t.addEventListener('click', () => { show(t.dataset.tab); blur(); }));

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-vol]');
    if (btn) {
      O.sfx.setVolume(O.sfx.level + Number(btn.dataset.vol));
      O.sfx.capture(1);              // 바뀐 크기로 미리 듣기
      render.settings();
      return;
    }
    const card = e.target.closest('[data-item]');
    if (card) { pickItem(card.dataset.kind, card.dataset.item); blur(); }
  });

  // 꾸미기 항목을 눌렀을 때: 가진 것은 장착, 살 수 있는 것은 한 번 더 눌러 구매
  function pickItem(kind, id) {
    const it = O.COSMETICS[kind].find((x) => x.id === id);
    if (!it) return;
    shopNote = '';
    if (O.isUnlocked(it)) {
      O.equip(kind, id);
      pendingBuy = null;
    } else if (it.unlock) {
      shopNote = it.name + ' unlocks at ' + O.achievement(it.unlock.ach).name + ' LV ' + it.unlock.level + '.';
      pendingBuy = null;
    } else if (O.getStars() < it.price) {
      shopNote = 'You need ' + (it.price - O.getStars()) + ' more stars for ' + it.name + '.';
      pendingBuy = null;
    } else if (pendingBuy === id) {
      O.buy(id);
      O.equip(kind, id);
      pendingBuy = null;
      O.sfx.achieve();
    } else {
      pendingBuy = id;               // 실수로 사지 않도록 한 번 더 눌러야 구매
    }
    render.customize();
    const scene = game.scene.getScene('game');
    if (scene && scene.applyStyle) scene.applyStyle();   // 게임에 바로 반영
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (panel.hidden) open(); else close();
  });

  refreshBadge();
  O.ui = { open, close, show, sync, refreshBadge };
})();
