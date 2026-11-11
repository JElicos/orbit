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

  const render = {
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
            '<div class="ach-sub">' + value + (next ? ' / ' + next : '') + ' ' + a.unit +
              (next ? '' : ' &middot; MAX') + '</div>' +
          '</div>';
      }
      body.innerHTML = html;
    },
  };

  function show(tab) {
    current = tab;
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
    if (!btn) return;
    O.sfx.setVolume(O.sfx.level + Number(btn.dataset.vol));
    O.sfx.capture(1);              // 바뀐 크기로 미리 듣기
    render.settings();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (panel.hidden) open(); else close();
  });

  O.ui = { open, close, show, sync };
})();
