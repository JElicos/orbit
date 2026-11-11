(() => {
  'use strict';

  // ---------- 조정값 ----------
  const W = 540, TAU = Math.PI * 2;

  // 화면 크기. 아이폰 홈 화면에서 실행하면 화면 전체(노치 영역 포함)를 씁니다.
  const STANDALONE = !!window.navigator.standalone && !!window.screen &&
    (window.innerHeight || 0) >= (window.innerWidth || 0);
  const VIEW = (() => {
    let vw = window.innerWidth || W, vh = window.innerHeight || 960;
    if (STANDALONE) {
      vw = Math.min(screen.width, screen.height);
      vh = Math.max(screen.width, screen.height);
    }
    return { vw, vh };
  })();
  // 아이폰 홈 화면 앱은 페이지 높이를 상태 표시줄만큼 짧게 알려줘서 아래쪽이 비는 문제가 있습니다.
  // 게임 영역 높이를 실제 화면 높이로 직접 지정해 맨 아래까지 채웁니다.
  if (STANDALONE) {
    document.getElementById('game').style.height = VIEW.vh + 'px';
  }
  // 게임 높이: 기본 960, 세로로 긴 화면에서는 위아래 빈 띠 없이 꽉 차도록 늘림
  const H = Math.max(960, Math.min(1300, Math.round(W * VIEW.vh / VIEW.vw)));
  // 노치와 홈 표시줄 높이(게임 좌표 단위)
  const SAFE = { top: 0, bottom: 0 };
  // 여백을 다시 재고, 값이 바뀌었으면 true를 돌려줍니다.
  function measureSafe() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    let top = parseFloat(cs.paddingTop) || 0, bottom = parseFloat(cs.paddingBottom) || 0;
    probe.remove();
    if (STANDALONE) {
      // 아이폰 홈 화면 앱은 시작 직후 여백을 0으로 알려줄 때가 있어, 화면과 페이지의 높이 차이로 보완
      const gap = VIEW.vh - (window.innerHeight || VIEW.vh);
      if (!top && gap > 0) top = gap;
      if (!bottom && top > 24) bottom = 34;   // 홈 표시줄이 있는 기종
    }
    const unit = W / Math.min(VIEW.vw, VIEW.vh * W / H);
    const t = top * unit, b = bottom * unit;
    const changed = Math.abs(t - SAFE.top) > 1 || Math.abs(b - SAFE.bottom) > 1;
    SAFE.top = t; SAFE.bottom = b;
    return changed;
  }
  measureSafe();
  const FLY_SPEED = 640;        // 발사 후 비행 속도(px/s)
  const BALL_R = 9;
  const STAR_PICK_R = 26;       // 별 획득 반경
  const STAR_SCORE = 2;
  const HOLE_R = 20;            // 블랙홀의 검은 원 반경
  const HOLE_KILL = 26;         // 이 거리 안으로 들어오면 게임 오버(안쪽 고리까지)
  const HOLE_FROM_STAGE = 4;    // 블랙홀이 나오기 시작하는 스테이지(0부터, 4 = SATURN)
  const CAM_ANCHOR = 0.65;      // 현재 행성이 화면 세로의 이 위치에 오도록
  const FONT = 'Bahnschrift, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

  const C = {
    bg: 0x070b1a,
    normal: 0x4cc9f0,
    moving: 0x80ed99,
    shrink: 0xff6b6b,
    reverse: 0xb388ff,
    ball: 0xffffff,
    star: 0xffd166,
    lava: 0xff3355,
  };
  const TYPE_HINT = {
    hole: 'BLACK HOLE - DON\'T TOUCH',
    moving: 'MOVING PLANET',
    shrink: 'SHRINKING ORBIT - JUMP FAST!',
    reverse: 'REVERSE SPIN',
  };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mixColor = (c1, c2, t) => {
    const r = Math.round(lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t));
    const g = Math.round(lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t));
    const b = Math.round(lerp(c1 & 255, c2 & 255, t));
    return (r << 16) | (g << 8) | b;
  };

  // 스테이지별 배경 테마(data.js의 STAGES와 같은 순서).
  // top/bottom: 배경 위아래 색, star: 별 색, starA: 별 밝기 배율, sun: 아래쪽 태양빛 세기
  const THEMES = [
    { top: 0x06102a, bottom: 0x0d2a55, star: 0xffffff, starA: 0.9, sun: 1.0 },    // EARTH
    { top: 0x140b12, bottom: 0x2a1210, star: 0xffe2d0, starA: 0.9, sun: 0.8 },    // MARS
    { top: 0x0e0d12, bottom: 0x1a1612, star: 0xf2e8dc, starA: 0.8, sun: 0.6 },    // ASTEROID BELT
    { top: 0x120d0a, bottom: 0x24170f, star: 0xffecd2, starA: 0.8, sun: 0.4 },    // JUPITER
    { top: 0x100e0a, bottom: 0x221c10, star: 0xfff2d6, starA: 0.9, sun: 0.3 },    // SATURN
    { top: 0x06121a, bottom: 0x0a2630, star: 0xd6f6ff, starA: 1.0, sun: 0.18 },   // ICE GIANTS
    { top: 0x05080f, bottom: 0x0a1220, star: 0xdde8ff, starA: 1.1, sun: 0.08 },   // KUIPER BELT
    { top: 0x0a0616, bottom: 0x160a2a, star: 0xe6dcff, starA: 1.3, sun: 0 },      // HELIOPAUSE
    { top: 0x050709, bottom: 0x0b1114, star: 0xe8f4ff, starA: 1.2, sun: 0 },      // OORT CLOUD
    { top: 0x020203, bottom: 0x06040a, star: 0xffffff, starA: 1.4, sun: 0 },      // BEYOND
  ];

  // 렌더링 배율: 화면의 실제 픽셀 수에 맞춰 1~3배로 그림(게임 속 좌표는 540x960 그대로)
  // 폰과 태블릿은 그리는 픽셀 수가 곧 속도라서 2배까지만 올림(눈으로는 거의 차이가 없음)
  const IS_MOBILE = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const RES = (() => {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(VIEW.vw / W, VIEW.vh / H) * dpr;
    return clamp(Math.ceil((fit || 1) * 2) / 2, 1, IS_MOBILE ? 2 : 3);
  })();
  const TEXT_RES = Math.max(2, Math.ceil(RES));

  const O = window.ORBIT;   // 저장 데이터와 도전과제 정의(data.js)
  const SCORE_TIERS = O.achievement('score').tiers;

  // ---------- 효과음(Web Audio 합성) ----------
  const Sfx = {
    ctx: null, master: null, muted: false,
    level: clamp(Math.round(O.getNum(O.KEY.volume, 4)), 0, O.VOLUME_STEPS),   // 볼륨 단계 0~5
    gain() { const k = this.level / O.VOLUME_STEPS; return 0.4 * k * k; },
    setVolume(level) {
      this.level = clamp(Math.round(level), 0, O.VOLUME_STEPS);
      O.setNum(O.KEY.volume, this.level);
      if (this.master) this.master.gain.value = this.gain();
    },
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.gain();
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    tone(f0, f1, dur, type, vol, delay) {
      if (!this.ctx || this.muted || this.level === 0) return;
      const t = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.03);
    },
    launch() { this.tone(220, 520, 0.12, 'triangle', 0.5); },
    capture(combo) {
      const scale = [0, 2, 4, 7, 9];           // 콤보가 오를수록 음정 상승
      const n = Math.min(Math.max(combo, 1) - 1, 14);
      const f = 392 * Math.pow(2, (scale[n % 5] + 12 * Math.floor(n / 5)) / 12);
      this.tone(f, f, 0.22, 'sine', 0.9);
      this.tone(f * 1.5, f * 1.5, 0.18, 'sine', 0.35, 0.05);
    },
    star() { this.tone(1320, 1760, 0.12, 'sine', 0.6); this.tone(1976, 1976, 0.15, 'sine', 0.4, 0.07); },
    die() { this.tone(300, 50, 0.5, 'sawtooth', 0.6); this.tone(90, 40, 0.5, 'square', 0.4); },
    achieve() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, f, 0.16, 'triangle', 0.5, 0.12 + i * 0.07)); },
    swallow() { this.tone(420, 36, 0.7, 'sine', 0.8); this.tone(210, 30, 0.7, 'triangle', 0.4, 0.05); },
    stage() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, f, 0.5, 'sine', 0.45, i * 0.09)); },
  };
  O.sfx = Sfx;
  // 아이폰은 손을 뗄 때(touchend)나 클릭에서만 소리 재생이 허용됩니다.
  ['touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, () => Sfx.init(), { passive: true }));

  // ---------- 미리 그려 두는 배경 그림 ----------
  // 2D 캔버스에 한 번만 그려 텍스처로 저장합니다. 매 프레임 도형을 다시 계산하지 않아 폰에서 훨씬 가볍습니다.
  const BAKE = Math.min(RES, 2);   // 배경 그림의 해상도 배율
  const css = (c) => '#' + c.toString(16).padStart(6, '0');
  const circlePath = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); };
  const oval = (ctx, x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); };

  // key 이름의 텍스처가 없으면 w x h(게임 좌표) 크기로 그려서 만듦. draw(ctx, scale)
  function bake(scene, key, w, h, scale, draw) {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, Math.ceil(w * scale), Math.ceil(h * scale));
    const ctx = tex.getContext();
    ctx.scale(scale, scale);
    draw(ctx, scale);
    tex.refresh();
  }

  // 스테이지의 배경색과 아래쪽 태양빛. 부드러운 그라데이션뿐이라 1/4 크기로 만들어 늘려 씀.
  function bakeStageBg(scene, i) {
    const th = THEMES[i], w = Math.ceil(W / 4), h = Math.ceil(H / 4);
    bake(scene, 'bg' + i, w, h, 1, (ctx) => {
      const lin = ctx.createLinearGradient(0, 0, 0, h);
      lin.addColorStop(0, css(th.top));
      lin.addColorStop(1, css(th.bottom));
      ctx.fillStyle = lin;
      ctx.fillRect(0, 0, w, h);
      if (th.sun > 0) {
        const cx = w / 2, cy = h + 75;
        const glow = ctx.createRadialGradient(cx, cy, 90, cx, cy, 275);
        glow.addColorStop(0, 'rgba(255,201,138,' + (0.2 * th.sun).toFixed(3) + ')');
        glow.addColorStop(1, 'rgba(255,201,138,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }
    });
  }

  // 원 안에 가로 줄무늬를 채움(목성, 토성)
  function bands(ctx, cx, cy, R, colors) {
    const bh = 2 * R / colors.length;
    colors.forEach((c, i) => { ctx.fillStyle = css(c); ctx.fillRect(cx - R, cy - R + i * bh, 2 * R, bh + 1); });
  }

  // 스테이지별 배경 천체 그림.
  // x, y: 화면에서의 왼쪽 위 위치, k: 위로 올라갈 때 아래로 흘러가는 정도, a: 투명도
  const BACKDROPS = {
    0: [{   // EARTH: 화면 아래의 커다란 지구(원의 윗부분만 그림)
      key: 'bd_earth', w: W, h: 330, x: 0, y: H - 240, k: 1.5, a: 1,
      draw(ctx, s) {
        const cx = W / 2, cy = 800, R = 760, top = cy - R;
        ctx.save();
        ctx.shadowColor = 'rgba(127,208,255,0.85)';
        ctx.shadowBlur = 24 * s;
        ctx.fillStyle = '#144a8f';
        circlePath(ctx, cx, cy, R);
        ctx.fill();
        ctx.restore();
        const sea = ctx.createRadialGradient(cx, cy, R - 240, cx, cy, R);
        sea.addColorStop(0, '#0f3d7a');
        sea.addColorStop(1, '#1b5cae');
        ctx.fillStyle = sea;
        circlePath(ctx, cx, cy, R);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#2c7a52';
        oval(ctx, cx - 120, top + 62, 75, 23);
        oval(ctx, cx + 135, top + 95, 95, 30);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        oval(ctx, cx + 20, top + 40, 60, 11);
        oval(ctx, cx - 190, top + 120, 70, 13);
        ctx.restore();
        circlePath(ctx, cx, cy, R);
        ctx.strokeStyle = 'rgba(127,208,255,0.5)';
        ctx.lineWidth = 4;
        ctx.stroke();
      },
    }],
    1: [{   // MARS
      key: 'bd_mars', w: 260, h: 260, x: 295, y: 170, k: 1, a: 0.75,
      draw(ctx) {
        const c = 130, R = 120;
        circlePath(ctx, c, c, R);
        ctx.fillStyle = '#8a4226';
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#6b2f1c';
        oval(ctx, c - 30, c + 20, 55, 22);
        oval(ctx, c + 45, c - 40, 35, 15);
        oval(ctx, c + 20, c + 70, 30, 11);
        ctx.fillStyle = 'rgba(242,230,220,0.8)';
        oval(ctx, c, c - R + 11, 29, 7);
        const shade = ctx.createRadialGradient(c - 40, c + 60, 40, c - 40, c + 60, 230);   // 아래쪽(태양 방향)이 밝음
        shade.addColorStop(0, 'rgba(0,0,0,0)');
        shade.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, 260, 260);
        ctx.restore();
        circlePath(ctx, c, c, R);
        ctx.strokeStyle = 'rgba(217,138,95,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      },
    }],
    3: [{   // JUPITER: 왼쪽에 걸친 거대한 줄무늬 행성
      key: 'bd_jupiter', w: 420, h: 780, x: 0, y: 50, k: 1, a: 0.45,
      draw(ctx) {
        const cx = 30, cy = 390, R = 380;
        circlePath(ctx, cx, cy, R);
        ctx.save();
        ctx.clip();
        bands(ctx, cx, cy, R, [0x6b5140, 0x8a6a4d, 0x5a4032, 0x94775a, 0x6b5140, 0x8f7155, 0x5c4334, 0x80634a, 0x6b5140, 0x5a4032, 0x7a5c44]);
        ctx.fillStyle = '#8a3f2a';
        oval(ctx, cx + 215, cy + 95, 38, 21);
        const shade = ctx.createLinearGradient(0, cy - R, 0, cy + R);
        shade.addColorStop(0, 'rgba(0,0,0,0.5)');
        shade.addColorStop(0.65, 'rgba(0,0,0,0)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, 420, 780);
        ctx.restore();
        circlePath(ctx, cx, cy, R);
        ctx.strokeStyle = 'rgba(184,154,120,0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();
      },
    }],
    4: [{   // SATURN: 기울어진 고리
      key: 'bd_saturn', w: 520, h: 300, x: 125, y: 190, k: 1, a: 0.7,
      draw(ctx) {
        const cx = 260, cy = 150, R = 105, tilt = -0.35;
        const rings = [[235, 62, 9, '184,166,122', 0.5], [205, 54, 12, '156,138,96', 0.6], [172, 45, 7, '201,184,140', 0.4]];
        const half = (a0, a1) => rings.forEach(([rx, ry, lw, rgb, al]) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(tilt);
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, a0, a1);
          ctx.strokeStyle = 'rgba(' + rgb + ',' + al + ')';
          ctx.lineWidth = lw;
          ctx.stroke();
          ctx.restore();
        });
        half(Math.PI, TAU);          // 고리의 뒤쪽 절반
        circlePath(ctx, cx, cy, R);
        ctx.save();
        ctx.clip();
        bands(ctx, cx, cy, R, [0x8f7d55, 0xa8956a, 0x80704c, 0x9c8a60, 0x8f7d55, 0x7a6a48]);
        const shade = ctx.createLinearGradient(0, cy - R, 0, cy + R);
        shade.addColorStop(0, 'rgba(0,0,0,0.45)');
        shade.addColorStop(0.7, 'rgba(0,0,0,0)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, 520, 300);
        ctx.restore();
        half(0, Math.PI);            // 고리의 앞쪽 절반
      },
    }],
    5: [{   // ICE GIANTS: 천왕성
      key: 'bd_uranus', w: 200, h: 200, x: 25, y: 200, k: 1, a: 0.5,
      draw(ctx) {
        const g = ctx.createRadialGradient(85, 120, 10, 100, 100, 95);
        g.addColorStop(0, '#74c2c2');
        g.addColorStop(1, '#3f8080');
        circlePath(ctx, 100, 100, 95);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(196,242,242,0.45)';
        ctx.lineWidth = 3;
        ctx.stroke();
      },
    }, {    // 해왕성
      key: 'bd_neptune', w: 150, h: 150, x: 365, y: 585, k: 1.4, a: 0.5,
      draw(ctx) {
        const g = ctx.createRadialGradient(65, 90, 8, 75, 75, 70);
        g.addColorStop(0, '#3f63cf');
        g.addColorStop(1, '#22398a');
        circlePath(ctx, 75, 75, 70);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(20,40,110,0.6)';
        oval(ctx, 60, 87, 40, 9);
        ctx.restore();
        circlePath(ctx, 75, 75, 70);
        ctx.strokeStyle = 'rgba(134,164,255,0.45)';
        ctx.lineWidth = 3;
        ctx.stroke();
      },
    }],
    7: [{   // HELIOPAUSE: 태양풍이 멈추는 경계의 물결
      key: 'bd_helio', w: W, h: 440, x: 0, y: H - 570, k: 2, a: 1, pulse: true,
      draw(ctx, s) {
        const cy = 1670;
        ctx.shadowBlur = 10 * s;
        [1380, 1450, 1540, 1650].forEach((r, i) => {
          const rgb = i % 2 ? '92,124,255' : '138,92,255';
          ctx.shadowColor = 'rgba(' + rgb + ',0.5)';
          ctx.strokeStyle = 'rgba(' + rgb + ',0.2)';
          ctx.lineWidth = 4 + i * 3;
          circlePath(ctx, W / 2, cy, r);
          ctx.stroke();
        });
      },
    }],
    8: [{   // OORT CLOUD: 화면 전체에 깔리는 옅은 안개(위아래로 이어 붙는 무늬)
      key: 'bd_fog', w: 270, h: 300, x: 0, y: 0, k: 0, a: 1, tile: true,
      draw(ctx) {
        for (let n = 0; n < 12; n++) {
          const x = Math.random() * 270, y = Math.random() * 300, r = rnd(60, 125);
          for (const ox of [-270, 0, 270]) {
            for (const oy of [-300, 0, 300]) {
              const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
              g.addColorStop(0, 'rgba(159,180,200,0.10)');
              g.addColorStop(1, 'rgba(159,180,200,0)');
              ctx.fillStyle = g;
              ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
            }
          }
        }
      },
    }],
    9: [{   // BEYOND: 멀리 보이는 은하
      key: 'bd_galaxy', w: 400, h: 260, x: W * 0.6 - 200, y: 190, k: 1, a: 1,
      draw(ctx) {
        const cx = 200, cy = 130, tilt = -0.5, ct = Math.cos(tilt), st = Math.sin(tilt);
        const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 55);
        core.addColorStop(0, 'rgba(255,240,208,0.4)');
        core.addColorStop(1, 'rgba(255,240,208,0)');
        ctx.fillStyle = core;
        ctx.fillRect(cx - 55, cy - 55, 110, 110);
        for (let i = 0; i < 190; i++) {
          const u = Math.random(), ang = (i % 2) * Math.PI + u * 5.5 + rnd(-0.25, 0.25), rad = 14 + u * 170 + rnd(-8, 8);
          const ex = Math.cos(ang) * rad, ey = Math.sin(ang) * rad * 0.45;
          ctx.fillStyle = 'rgba(205,184,255,' + rnd(0.25, 0.7).toFixed(2) + ')';
          circlePath(ctx, cx + ex * ct - ey * st, cy + ex * st + ey * ct, rnd(0.8, 2));
          ctx.fill();
        }
      },
    }],
  };

  let seenTitle = false;
  const seenTypes = new Set();

  // ---------- 본 게임 ----------
  class GameScene extends Phaser.Scene {
    constructor() { super('game'); }

    create() {
      this.state = 'orbit';       // orbit | fly | dead
      this.bloomFx = null;        // 발광 효과(다시 시작하면 카메라가 새로 만들어지므로 초기화)
      this.started = false;
      this.t = 0;
      this.deadAt = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.maxIndex = 0;
      this.quick = false;
      this.best = O.getNum(O.KEY.best, 0);
      this.bestCombo = O.getNum(O.KEY.bestCombo, 0);
      this.stats = O.loadStats();                           // 행성 종류별 누적 착지 횟수
      this.scoreTier = O.tierOf(SCORE_TIERS, this.best);    // 이미 달성한 점수 도전과제 단계
      this.jumps = 0;                                       // 이번 시도에서 옮겨 탄 행성 수
      this.bestIndex = O.getNum(O.KEY.bestDist, 0);         // 역대 가장 멀리 간 행성 번호
      this.bestLineY = null;                                // 역대 최장 거리 위치(BEST 기록선)
      this.recordShown = false;
      this.stageTier = O.valueOf('stage');                  // 이미 달성한 스테이지 도전과제 단계
      this.unlocked = [];                                   // 이번 시도에서 달성한 도전과제
      this.stage = 0;                                       // 현재 스테이지(0부터)
      this.prevStage = 0;                                   // 배경이 바뀌는 동안의 이전 스테이지
      this.themeMix = 1;                                    // 이전 -> 현재 배경 전환 진행도(0~1)

      this.planets = [];
      this.holes = [];            // 블랙홀
      this.suck = null;           // 블랙홀에 빨려 들어가는 연출 상태
      this.stars = [];
      this.rings = [];
      this.trail = [];
      this.trailSeq = 0;
      this.starsRun = 0;          // 이번 시도에서 모은 별
      this.ballColor = C.ball;    // 장착한 공 색과 궤적(applyStyle에서 설정)
      this.trailStyle = 'trail_comet';
      this.nextIndex = 0;

      // 배경 별(시차 3겹)
      this.bgStars = [];
      for (let i = 0; i < 90; i++) {
        const layer = i % 3;
        this.bgStars.push({
          x: Math.random() * W, y: Math.random() * H,
          f: [0.08, 0.2, 0.4][layer], r: [1, 1.4, 2][layer], a: [0.35, 0.55, 0.8][layer],
          tw: Math.random() * TAU,
        });
      }

      if (!this.textures.exists('dot')) {
        const tg = this.make.graphics({ x: 0, y: 0, add: false });
        tg.fillStyle(0xffffff, 1); tg.fillCircle(24, 24, 24);
        tg.generateTexture('dot', 48, 48); tg.destroy();
      }

      // 고해상도로 그리되 게임 속 좌표는 그대로 쓰도록 카메라를 확대
      this.cameras.main.setOrigin(0, 0).setZoom(RES);

      this.bg = this.add.graphics().setScrollFactor(0).setDepth(-3);   // 별과 떠다니는 조각(배경색 그림 위, 배경 천체 아래)
      this.g = this.add.graphics().setDepth(1);
      this.emitter = this.add.particles(0, 0, 'dot', {
        speed: { min: 60, max: 260 }, lifespan: { min: 300, max: 700 },
        scale: { start: 0.2, end: 0 }, alpha: { start: 1, end: 0 },
        blendMode: 'ADD', emitting: false,
      }).setDepth(2);

      // 첫 행성과 공
      this.spawnPlanet();
      const p0 = this.planets[0];
      this.ball = {
        x: p0.x, y: p0.y - p0.orbitR, vx: 0, vy: 0,
        planet: p0, left: null, angle: -Math.PI / 2, dir: 1, orbR: p0.orbitR, swept: TAU,
      };
      this.camY = p0.y - H * CAM_ANCHOR;
      this.camY0 = this.camY;       // 현재 스테이지에 들어선 순간의 카메라 위치(배경 천체의 기준점)
      this.prevCamY0 = this.camY;
      this.initBackdrops();
      this.lavaY = p0.y + H * (1 - CAM_ANCHOR) + 184;   // 화면 아래쪽 바깥에서 시작
      while (this.topPlanet().y > this.camY - 400) this.spawnPlanet();

      this.buildUI();

      this.input.keyboard.addCapture('SPACE');
      this.input.keyboard.on('keydown-SPACE', (e) => { if (!e.repeat) this.action(); });
      this.input.keyboard.on('keydown-M', () => {
        Sfx.muted = !Sfx.muted;
        this.toast(Sfx.muted ? 'SOUND OFF' : 'SOUND ON');
      });
      this.input.on('pointerdown', () => this.action());


      this.cameras.main.scrollY = this.camY;
    }

    // ----- UI -----
    buildUI() {
      const txt = (x, y, s, size, color) => this.add.text(x, y, s, {
        fontFamily: FONT, fontSize: size + 'px', color: color || '#ffffff', fontStyle: 'bold',
        align: 'center', resolution: TEXT_RES,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(10);

      const top = SAFE.top, bottom = H - SAFE.bottom;   // 노치와 홈 표시줄을 피한 기준선
      this.scoreText = txt(W / 2, top + 72, '0', 64);
      this.comboText = txt(W / 2, top + 128, '', 26, '#ffd166').setVisible(false);
      this.bestText = txt(16, top + 22, 'BEST ' + this.best, 18, '#8fa3c8').setOrigin(0, 0.5);

      this.titleGroup = [];
      if (!seenTitle) {
        this.titleGroup.push(txt(W / 2, top + 220, 'ORBIT', 84).setLetterSpacing(14));
        if (!this.isTouch()) this.titleGroup.push(txt(W / 2, bottom - 80, 'M : MUTE     ESC : MENU', 16, '#8fa3c8'));
      }
      this.hintText = txt(W / 2, bottom - 160, this.isTouch() ? 'TAP TO LAUNCH' : 'SPACE / CLICK TO LAUNCH', 22, '#cfe3ff');
      this.tweens.add({ targets: this.hintText, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

      this.toastText = txt(W / 2, top + 180, '', 22, '#ffffff').setAlpha(0);

      // 보유 별
      this.starText = txt(16, top + 48, '', 18, '#ffd166').setOrigin(0, 0.5);
      this.applyStyle();
      // 초당 프레임 수(SETTINGS에서 켬)
      this.fpsText = txt(16, top + 74, '', 15, '#8fa3c8').setOrigin(0, 0.5);
      this.fpsMs = 0;
      this.fpsFrames = 0;
      this.applySettings();

      // 현재 거리와 스테이지
      this.distText = txt(W / 2, top + 118, '', 18, '#8fa3c8');
      this.updateDist();
      // BEST 기록선 옆 글자(게임 세계 안에 놓임)
      this.bestLineLabel = this.add.text(12, 0, 'BEST  ' + this.distLabel(this.bestIndex), {
        fontFamily: FONT, fontSize: '16px', color: '#ffd166', fontStyle: 'bold', resolution: TEXT_RES,
      }).setOrigin(0, 1).setDepth(3).setAlpha(0.8).setVisible(false);

      // 스테이지 전환 배너
      this.bannerTop = txt(W / 2, H * 0.34, '', 22, '#8fa3c8').setLetterSpacing(8).setAlpha(0);
      this.bannerName = txt(W / 2, H * 0.34 + 48, '', 50, '#ffffff').setLetterSpacing(4).setAlpha(0);

      // 여백 값이 늦게 확정되는 기기를 위해 잠시 뒤 다시 재서 위치를 맞춤
      this.layoutUI();
      [300, 1200].forEach((ms) => this.time.delayedCall(ms, () => this.layoutUI()));
    }

    // 점수와 안내 문구를 노치와 홈 표시줄 안쪽에 배치
    layoutUI() {
      measureSafe();
      const top = SAFE.top, bottom = H - SAFE.bottom;
      this.scoreText.setY(top + 72);
      this.distText.setY(top + 118);
      this.comboText.setY(top + 152);
      // 노치가 있는 기기는 상태 표시줄 바로 아래가 흐리게 처리되므로 조금 더 내림
      this.bestText.setY(top + (top > 0 ? 50 : 22));
      this.starText.setY(top + (top > 0 ? 76 : 48));
      this.fpsText.setY(top + (top > 0 ? 102 : 74));
      this.toastText.setY(top + 196);
      this.hintText.setY(bottom - 160);
      if (this.titleGroup[0]) this.titleGroup[0].setY(top + 220);
      if (this.titleGroup[1]) this.titleGroup[1].setY(bottom - 80);
    }

    // 휴대폰이나 태블릿이면 키보드 안내 대신 터치 안내를 보여줌
    isTouch() { return !this.sys.game.device.os.desktop; }

    toast(msg, color) {
      this.toastText.setText(msg).setColor(color || '#ffffff').setAlpha(1);
      this.tweens.killTweensOf(this.toastText);
      this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1300, duration: 500 });
    }

    // 행성 번호를 "5.4 AU" 같은 거리 글자로
    distLabel(index) { return O.formatAU(O.distanceAU(index)) + ' AU'; }

    updateStars() { this.starText.setText('★ ' + O.getStars()); }

    // 장착한 공 색과 궤적을 적용(메뉴에서 바꾸면 ui.js가 다시 부름)
    applyStyle() {
      const eq = O.getEquip();
      this.ballColor = parseInt(eq.ball.color.slice(1), 16);
      this.trailStyle = eq.trail.id;
      this.updateStars();
    }

    // SETTINGS에서 바꾼 표시 설정을 적용(ui.js가 다시 부름)
    applySettings() {
      this.showFps = O.getNum(O.KEY.showFps, 0) === 1;
      this.fpsText.setVisible(this.showFps);
      this.fpsMs = 0;
      this.fpsFrames = 0;
      this.applyGlow();
    }

    // 화면 전체 발광 효과. 고해상도 화면 전체를 여러 번 흐리게 처리해서 폰에서는 무겁습니다.
    // 끄면 행성과 공 둘레에 옅은 빛만 직접 그립니다(draw 참고).
    applyGlow() {
      this.glowOn = O.getNum(O.KEY.glow, O.isMobile ? 0 : 1) === 1;
      const cam = this.cameras.main;
      try {
        if (this.game.renderer.type !== Phaser.WEBGL || !cam.postFX) { this.glowOn = false; return; }
        if (this.glowOn && !this.bloomFx) this.bloomFx = cam.postFX.addBloom(0xffffff, 1, 1, 1, 0.55, 4);
        else if (!this.glowOn && this.bloomFx) { cam.postFX.clear(); this.bloomFx = null; }
      } catch (e) { this.glowOn = false; this.bloomFx = null; }
    }

    // 0.5초마다 평균 프레임 수를 갱신. 낮을수록 주황, 빨강으로 표시.
    updateFps(delta) {
      this.fpsMs += delta;
      this.fpsFrames++;
      if (this.fpsMs < 500) return;
      const fps = Math.round(this.fpsFrames * 1000 / this.fpsMs);
      this.fpsText.setText(fps + ' FPS').setColor(fps >= 55 ? '#8fa3c8' : fps >= 30 ? '#ff9a3c' : '#ff5d5d');
      this.fpsMs = 0;
      this.fpsFrames = 0;
    }

    updateDist() {
      this.distText.setText(this.distLabel(this.maxIndex) + '  ·  ' + O.STAGES[O.stageOf(this.maxIndex)].name);
    }

    showBanner(stage) {
      const banner = [this.bannerTop, this.bannerName];
      this.bannerTop.setText('STAGE ' + (stage + 1));
      this.bannerName.setText(O.STAGES[stage].name);
      this.tweens.killTweensOf(banner);
      banner.forEach((b) => b.setAlpha(0));
      this.tweens.add({ targets: banner, alpha: 1, duration: 350, hold: 1500, yoyo: true });
    }

    // 새 스테이지 진입: 배경 전환을 시작하고 배너를 띄움
    enterStage(stage) {
      this.prevStage = this.stage;
      this.prevCamY0 = this.camY0;
      this.stage = stage;
      this.camY0 = this.camY;
      this.themeMix = 0;
      this.setStageImages();
      this.time.delayedCall(1500, () => this.prebake(stage + 1));   // 다음 스테이지 그림을 미리 준비
      this.showBanner(stage);
      Sfx.stage();
    }

    // 도전과제 달성: 바로 알리고, 게임 오버 화면에 모아 보여줄 목록에도 기록
    achieved(ach, level) {
      this.toast('ACHIEVEMENT  ' + ach.name + '  LV ' + level, '#ffd166');
      Sfx.achieve();
      const found = this.unlocked.find((u) => u.id === ach.id);
      if (found) found.level = Math.max(found.level, level);   // 같은 종목은 가장 높은 단계만
      else this.unlocked.push({ id: ach.id, name: ach.name, level, from: level - 1 });   // from: 이번 판 시작 전 단계
      O.setNum(O.KEY.newAch, 1);
      if (O.ui) O.ui.refreshBadge();
    }

    popup(x, y, msg, color) {
      const t = this.add.text(x, y, msg, {
        fontFamily: FONT, fontSize: '26px', color: color || '#ffffff', fontStyle: 'bold', resolution: TEXT_RES,
      }).setOrigin(0.5).setDepth(5);
      this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 700, onComplete: () => t.destroy() });
    }

    // ----- 행성 생성 -----
    topPlanet() { return this.planets[this.planets.length - 1]; }

    spawnPlanet() {
      const i = this.nextIndex++;
      const d = Math.min(i, 40);
      const orbitR = Math.max(44, 64 - d * 0.5);
      const p = {
        index: i, type: 'normal', x: W / 2, y: 0, baseX: W / 2,
        orbitR, curOrbit: orbitR, r: orbitR * 0.42,
        omega: Math.min(4.2, 2.6 + i * 0.035),
        amp: 0, w: 0, phase: 0,
      };

      if (i > 0) {
        const prev = this.topPlanet();
        const roll = Math.random();
        if (i >= 5 && roll < 0.25) p.type = 'moving';
        else if (i >= 8 && roll < 0.42) p.type = 'reverse';
        else if (i >= 11 && roll < 0.60) p.type = 'shrink';

        if (p.type === 'moving') { p.amp = rnd(40, 85); p.w = rnd(0.8, 1.4); p.phase = rnd(0, TAU); }

        const margin = orbitR + p.amp + 24;
        p.baseX = clamp(prev.baseX + rnd(-230, 230), margin, W - margin);
        p.x = p.baseX;
        p.y = prev.y - rnd(200 + d * 1.5, 260 + d * 2.5);
        // 역대 최장 기록 행성과 그다음 행성 사이에 기록선을 둠
        if (this.bestIndex >= 1 && i === this.bestIndex + 1) this.bestLineY = (prev.y + p.y) / 2;

        // 두 행성 사이의 별(고정 행성 사이에만)
        if (i >= 2 && p.type !== 'moving' && prev.type !== 'moving' && Math.random() < 0.55) {
          const mx = (prev.x + p.x) / 2, my = (prev.y + p.y) / 2;
          const dx = p.x - prev.x, dy = p.y - prev.y, len = Math.hypot(dx, dy) || 1;
          const off = rnd(-40, 40);
          // 4스테이지(JUPITER)부터는 가끔 별 5개짜리 큰 별
          this.stars.push({
            x: clamp(mx - dy / len * off, 20, W - 20), y: my + dx / len * off, taken: false,
            big: O.stageOf(i) >= 3 && Math.random() < 0.2,
          });
        }

        // 블랙홀: 일정 스테이지부터, 멀리 갈수록 자주(고정 행성 사이에만)
        const stage = O.stageOf(i);
        if (stage >= HOLE_FROM_STAGE && p.type !== 'moving' && prev.type !== 'moving' &&
            Math.random() < 0.22 + (stage - HOLE_FROM_STAGE) * 0.04) this.spawnHole(prev, p);   // 자리가 없으면 생략되므로 실제 빈도는 이보다 낮음
      }
      this.planets.push(p);
    }

    // 두 행성 사이 옆쪽에 블랙홀을 둠.
    // 다음 행성에 닿는 발사 경로는 모두 두 행성을 잇는 선에서 궤도 반경 이내를 지나므로,
    // 그 통로 밖에 두면 정확히 쏜 공은 절대 닿지 않습니다.
    spawnHole(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const off = Math.max(a.orbitR, b.orbitR) + HOLE_KILL + BALL_R + 12 + rnd(0, 36);
      for (const side of (Math.random() < 0.5 ? [1, -1] : [-1, 1])) {
        const x = mx + nx * off * side, y = my + ny * off * side;
        if (x < HOLE_R + 14 || x > W - HOLE_R - 14) continue;   // 화면 밖으로 나가면 반대쪽 시도
        this.holes.push({ x, y });
        return;
      }
    }

    // ----- 입력 -----
    action() {
      Sfx.init();
      if (this.state === 'dead') {
        if (this.t - this.deadAt > 0.5) this.scene.restart();
        return;
      }
      if (this.state !== 'orbit') return;

      const b = this.ball, p = b.planet;
      if (!this.started) {
        this.started = true;
        seenTitle = true;
        this.tweens.killTweensOf(this.hintText);
        this.tweens.add({ targets: [this.hintText, ...this.titleGroup], alpha: 0, duration: 250 });
        this.showBanner(0);
        this.quick = false;
      } else {
        this.quick = b.swept < TAU;   // 한 바퀴 돌기 전에 뛰면 콤보 유지
      }
      // 접선 방향으로 발사
      b.vx = -Math.sin(b.angle) * b.dir * FLY_SPEED;
      b.vy = Math.cos(b.angle) * b.dir * FLY_SPEED;
      b.left = p;
      b.planet = null;
      this.state = 'fly';
      Sfx.launch();
    }

    // ----- 포획 -----
    capture(p) {
      const b = this.ball;
      const rx = b.x - p.x, ry = b.y - p.y;
      let dir = (rx * b.vy - ry * b.vx) >= 0 ? 1 : -1;   // 진입 방향대로 회전
      if (p.type === 'reverse') dir = -dir;
      b.planet = p; b.left = null;
      b.angle = Math.atan2(ry, rx);
      b.orbR = Math.hypot(rx, ry);
      b.dir = dir;
      b.swept = 0;
      p.curOrbit = p.orbitR;
      this.state = 'orbit';

      const color = C[p.type];
      this.rings.push({ x: p.x, y: p.y, r: p.orbitR, life: 1, color, follow: p });
      this.emitter.setParticleTint(color);
      this.emitter.explode(14, b.x, b.y);

      if (p.index > this.maxIndex) {
        this.maxIndex = p.index;
        this.combo = this.quick ? this.combo + 1 : 1;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.addScore(this.combo);
        this.popup(p.x, p.y - p.orbitR - 22, '+' + this.combo, this.combo > 1 ? '#ffd166' : '#ffffff');
        if (p.type !== 'normal' && !seenTypes.has(p.type)) {
          seenTypes.add(p.type);
          this.toast(TYPE_HINT[p.type]);
        }
        // 전적과 도전과제 집계
        this.jumps++;
        this.stats[p.type]++;
        O.saveStats(this.stats);
        const ach = O.achievement(p.type);
        const lv = ach.tiers.indexOf(this.stats[p.type]);
        if (lv >= 0) this.achieved(ach, lv + 1);
        const stage = O.stageOf(p.index);
        if (stage !== this.stage) this.enterStage(stage);
        this.updateDist();
        if (p.index > O.getNum(O.KEY.bestDist, 0)) O.setNum(O.KEY.bestDist, p.index);   // 도중에 꺼도 남도록 바로 저장
        if (stage + 1 > this.stageTier) {
          this.stageTier = stage + 1;
          this.achieved(O.achievement('stage'), this.stageTier);
        }
        if (this.bestIndex >= 1 && p.index > this.bestIndex && !this.recordShown) {
          this.recordShown = true;
          this.toast('NEW DISTANCE RECORD', '#ffd166');
          Sfx.achieve();
        }
      } else {
        this.combo = 0;   // 이미 지난 행성으로 돌아가면 점수 없음
      }
      this.comboText.setText('COMBO x' + this.combo).setVisible(this.combo >= 2);
      if (this.combo >= 2) {
        this.comboText.setScale(1.4);
        this.tweens.add({ targets: this.comboText, scale: 1, duration: 200 });
      }
      Sfx.capture(this.combo);
    }

    addScore(n) {
      this.score += n;
      let tierUp = false;
      while (this.scoreTier < SCORE_TIERS.length && this.score >= SCORE_TIERS[this.scoreTier]) { this.scoreTier++; tierUp = true; }
      if (tierUp) this.achieved(O.achievement('score'), this.scoreTier);
      this.scoreText.setText(String(this.score));
      this.scoreText.setScale(1.25);
      this.tweens.add({ targets: this.scoreText, scale: 1, duration: 180 });
    }

    // hole: 블랙홀에 닿아 죽은 경우 그 블랙홀
    die(hole) {
      if (this.state === 'dead') return;
      const b = this.ball;
      this.state = 'dead';
      this.deadAt = this.t;
      if (hole) {
        // 폭발 대신 공이 블랙홀 중심으로 빨려 들어가며 사라짐
        this.suck = { x: b.x, y: b.y, hole, k: 0 };
        this.cameras.main.shake(220, 0.006);
        Sfx.swallow();
      } else {
        this.emitter.setParticleTint(0xffffff);
        this.emitter.explode(40, clamp(b.x, 0, W), clamp(b.y, this.camY, this.camY + H));
        this.cameras.main.shake(300, 0.012);
        Sfx.die();
      }

      const newBest = this.score > this.best;
      if (newBest) { this.best = this.score; O.setNum(O.KEY.best, this.best); }
      if (this.maxCombo > this.bestCombo) { this.bestCombo = this.maxCombo; O.setNum(O.KEY.bestCombo, this.bestCombo); }
      const newDist = this.maxIndex > this.bestIndex;
      if (newDist) { this.bestIndex = this.maxIndex; O.setNum(O.KEY.bestDist, this.bestIndex); }
      O.addHistory({ score: this.score, combo: this.maxCombo, planets: this.jumps, dist: this.maxIndex, at: Date.now() });

      this.time.delayedCall(350, () => {
        // 이번 판에서 달성한 도전과제(최대 4줄, 넘으면 "+N MORE")
        const shown = this.unlocked.slice(0, 4), more = this.unlocked.length - shown.length;
        const achH = this.unlocked.length ? 44 + (shown.length + (more > 0 ? 1 : 0)) * 28 : 0;
        const mid = H / 2 - 205 - achH / 2;   // 게임 오버 글자 묶음의 맨 윗줄
        this.distText.setVisible(false);
        const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setScrollFactor(0).setDepth(9).setAlpha(0);
        const mk = (y, s, size, color) => this.add.text(W / 2, y, s, {
          fontFamily: FONT, fontSize: size + 'px', color, fontStyle: 'bold', align: 'center', resolution: TEXT_RES,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10).setAlpha(0);
        const items = [
          dim,
          mk(mid, 'GAME OVER', 58, '#ffffff'),
          mk(mid + 90, 'SCORE ' + this.score, 40, '#ffffff'),
          mk(mid + 138, newBest ? 'NEW BEST!' : 'BEST ' + this.best, 22, newBest ? '#ffd166' : '#8fa3c8'),
          mk(mid + 196, this.distLabel(this.maxIndex) + '  ·  ' + O.STAGES[O.stageOf(this.maxIndex)].name, 28, '#ffffff'),
          mk(mid + 234, newDist ? 'NEW DISTANCE RECORD!' : 'FARTHEST ' + this.distLabel(this.bestIndex), 20, newDist ? '#ffd166' : '#8fa3c8'),
          mk(mid + 276, 'MAX COMBO x' + this.maxCombo + '  ·  ALL-TIME x' + this.bestCombo, 20, '#8fa3c8'),
          mk(mid + 306, '★ +' + this.starsRun + '  ·  TOTAL ' + O.getStars(), 20, '#ffd166'),
          mk(mid + 400 + achH, this.isTouch() ? 'TAP TO RETRY' : 'SPACE / CLICK TO RETRY', 22, '#cfe3ff'),
        ];
        if (this.unlocked.length) {
          items.push(mk(mid + 360, 'ACHIEVEMENTS UNLOCKED', 18, '#ffd166').setLetterSpacing(3));
          shown.forEach((u, i) => {
            // 이 도전과제로 열린 꾸미기 항목이 있으면 함께 표시
            const reward = O.rewardsFor(u.id, u.from, u.level).map((r) => r.name).join(', ');
            items.push(mk(mid + 394 + i * 28, u.name + '   LV ' + u.level + (reward ? '   ·   ' + reward + ' UNLOCKED' : ''), 20, '#ffffff'));
          });
          if (more > 0) items.push(mk(mid + 394 + shown.length * 28, '+' + more + ' MORE', 18, '#8fa3c8'));
        }
        this.starText.setVisible(false);
        this.scoreText.setVisible(false); this.comboText.setVisible(false);
        this.tweens.add({ targets: items, alpha: { from: 0, to: 1 }, duration: 250 });
        dim.setAlpha(0);
        this.tweens.add({ targets: dim, alpha: 1, duration: 250 });
      });
    }

    // ----- 매 프레임 -----
    update(time, delta) {
      const dt = Math.min(delta, 33) / 1000;
      this.t += dt;
      if (this.showFps) this.updateFps(delta);
      const b = this.ball;

      for (const p of this.planets) {
        if (p.type === 'moving') p.x = p.baseX + Math.sin(this.t * p.w + p.phase) * p.amp;
      }

      if (this.state === 'orbit') {
        const p = b.planet;
        b.angle += b.dir * p.omega * dt;
        b.swept += p.omega * dt;
        if (p.type === 'shrink' && this.started) {
          p.curOrbit -= (p.orbitR - p.r - BALL_R) / 4 * dt;
          if (p.curOrbit <= p.r + BALL_R) { this.die(); }
        }
        b.orbR += (p.curOrbit - b.orbR) * Math.min(1, dt * 10);
        b.x = p.x + Math.cos(b.angle) * b.orbR;
        b.y = p.y + Math.sin(b.angle) * b.orbR;
      } else if (this.state === 'fly') {
        b.x += b.vx * dt; b.y += b.vy * dt;

        for (const p of this.planets) {
          if (p === b.left) continue;
          if (Math.hypot(b.x - p.x, b.y - p.y) <= p.orbitR + 4) { this.capture(p); break; }
        }
        if (this.state === 'fly') {
          for (const s of this.stars) {
            if (!s.taken && Math.hypot(b.x - s.x, b.y - s.y) <= STAR_PICK_R) {
              s.taken = true;
              const worth = s.big ? 5 : 1;          // 보유 별 증가량
              O.addStars(worth);
              this.starsRun += worth;
              this.updateStars();
              this.addScore(s.big ? 5 : STAR_SCORE);
              this.popup(s.x, s.y - 20, '★ +' + worth, '#ffd166');
              this.emitter.setParticleTint(C.star);
              this.emitter.explode(10, s.x, s.y);
              Sfx.star();
            }
          }
          for (const h of this.holes) {
            if (Math.hypot(b.x - h.x, b.y - h.y) <= HOLE_KILL) { this.die(h); break; }
          }
          if (b.x < -30 || b.x > W + 30 || b.y > this.camY + H + 30 || b.y < this.camY - 200) this.die();
        }
      }

      if (this.suck && this.suck.k < 1) this.suck.k = Math.min(1, this.suck.k + dt / 0.45);
      // 블랙홀이 처음 화면에 들어오면 한 번 안내
      if (!seenTypes.has('hole') && this.holes.some((h) => h.y > this.camY + 60)) {
        seenTypes.add('hole');
        this.toast(TYPE_HINT.hole, '#ff9a3c');
      }

      if (this.state !== 'dead') {
        this.trail.push({ x: b.x, y: b.y, q: this.trailSeq++ });   // q: 지점 순번(점선, 무지개 등에 사용)
        if (this.trail.length > 40) this.trail.shift();
      } else if (this.trail.length) {
        this.trail.shift();
      }

      // 아래에서 올라오는 경계선
      if (this.started && this.state !== 'dead') {
        this.lavaY -= Math.min(95, 28 + this.maxIndex * 1.2) * dt;
        this.lavaY = Math.min(this.lavaY, this.camY + H + 60);
        if (b.y > this.lavaY) this.die();
      }

      // 카메라(위로만 이동)
      if (this.state !== 'dead') {
        let target = this.camY;
        if (this.state === 'orbit') target = b.planet.y - H * CAM_ANCHOR;
        else target = Math.min(target, b.y - H * 0.35);
        if (target < this.camY) this.camY += (target - this.camY) * Math.min(1, dt * 5);
        this.cameras.main.scrollY = this.camY;
      }

      // 생성과 정리
      while (this.topPlanet().y > this.camY - 400) this.spawnPlanet();
      const cut = this.camY + H + 200;
      if (this.planets[0].y > cut && this.planets[0] !== b.planet && this.planets[0] !== b.left) this.planets.shift();
      if (this.stars.length && this.stars[0].y > cut) this.stars.shift();
      if (this.holes.length && this.holes[0].y > cut) this.holes.shift();

      if (this.themeMix < 1) this.themeMix = Math.min(1, this.themeMix + dt / 2.5);

      for (const r of this.rings) { r.life -= dt * 2.2; r.r += 90 * dt; }
      this.rings = this.rings.filter((r) => r.life > 0);

      this.draw();
    }

    // ----- 배경 -----
    // 모양이 변하지 않는 배경(배경색, 태양빛, 행성, 고리, 안개, 은하)은 미리 그림으로 만들어 두고
    // 플레이 중에는 위치와 투명도만 바꿉니다. 매 프레임 다시 그리는 것은 별과 떠다니는 조각뿐입니다.
    initBackdrops() {
      const rocks = (n, minS, maxS) => Array.from({ length: n }, () => {
        const size = rnd(minS, maxS), k = 5 + Math.floor(Math.random() * 3);
        return {
          x: Math.random() * W, y: Math.random() * (H + 80), f: rnd(0.25, 0.6),
          rot: rnd(0, TAU), spin: rnd(-0.4, 0.4),
          shape: Array.from({ length: k }, (_, j) => ({ a: j / k * TAU, r: size * rnd(0.6, 1) })),
        };
      });
      this.rocks = rocks(26, 4, 16);
      this.ice = rocks(14, 3, 9);
      this.comets = Array.from({ length: 8 }, () => ({
        x: Math.random() * W, y: Math.random() * (H + 80), f: rnd(0.2, 0.45), a: rnd(0.7, 2.4),
      }));

      this.bdImgs = {};   // 배경 천체 그림(필요해질 때 만듦)
      this.prebake(0);
      this.bgA = this.add.image(0, 0, 'bg0').setOrigin(0, 0).setScrollFactor(0).setDepth(-5);   // 이전 스테이지 배경색
      this.bgB = this.add.image(0, 0, 'bg0').setOrigin(0, 0).setScrollFactor(0).setDepth(-4);   // 현재 스테이지 배경색
      this.setStageImages();
      this.time.delayedCall(1200, () => this.prebake(1));
    }

    // 스테이지에 필요한 그림을 미리 만들어 둠(전환 순간에 멈칫하지 않도록 한 스테이지 앞서 호출)
    prebake(stage) {
      if (stage < 0 || stage >= THEMES.length) return;
      bakeStageBg(this, stage);
      for (const d of BACKDROPS[stage] || []) bake(this, d.key, d.w, d.h, d.tile ? 1 : BAKE, d.draw);
    }

    // 배경색 그림 두 장을 이전/현재 스테이지 것으로 교체
    setStageImages() {
      this.prebake(this.prevStage);
      this.prebake(this.stage);
      this.bgA.setTexture('bg' + this.prevStage).setDisplaySize(W, H);
      this.bgB.setTexture('bg' + this.stage).setDisplaySize(W, H);
    }

    // 카메라 이동에 따라 천천히 흘러가다 화면 밖으로 나가면 반대쪽에서 다시 나오는 y 좌표
    wrapY(y, f) {
      const span = H + 80;
      return (((y - this.camY * f) % span) + span) % span - 40;
    }

    drawBackground() {
      const bg = this.bg, m = this.themeMix;
      const a = THEMES[this.prevStage], b = THEMES[this.stage];

      // 배경색과 태양빛: 그림 두 장을 겹쳐 서서히 전환
      this.bgA.setVisible(m < 1);
      this.bgB.setAlpha(m);

      bg.clear();
      const starColor = mixColor(a.star, b.star, m), starA = lerp(a.starA, b.starA, m);
      for (const s of this.bgStars) {
        const y = (((s.y - this.camY * s.f) % H) + H) % H;
        bg.fillStyle(starColor, Math.min(1, s.a * starA * (0.7 + 0.3 * Math.sin(this.t * 2 + s.tw))));
        bg.fillCircle(s.x, y, s.r);
      }

      for (const key in this.bdImgs) this.bdImgs[key].setVisible(false);
      if (m < 1) this.showBackdrop(this.prevStage, 1 - m, this.prevCamY0);
      this.showBackdrop(this.stage, m, this.camY0);
    }

    // 스테이지별 배경 천체. alpha는 전환 중 서서히 나타나고 사라지는 정도.
    showBackdrop(stage, alpha, camY0) {
      if (alpha <= 0.01) return;
      const bg = this.bg, t = this.t;
      const drift = (camY0 - this.camY) * 0.1;   // 위로 올라갈수록 배경 천체는 천천히 아래로

      // 미리 만든 그림
      for (const d of BACKDROPS[stage] || []) {
        let img = this.bdImgs[d.key];
        if (!img) {
          bake(this, d.key, d.w, d.h, d.tile ? 1 : BAKE, d.draw);
          img = d.tile
            ? this.add.tileSprite(0, 0, W, H, d.key).setTileScale(2, 2)
            : this.add.image(d.x, d.y, d.key).setDisplaySize(d.w, d.h);
          img.setOrigin(0, 0).setScrollFactor(0).setDepth(-2);
          this.bdImgs[d.key] = img;
        }
        img.setVisible(true).setAlpha(alpha * d.a * (d.pulse ? 0.75 + 0.25 * Math.sin(t * 1.2) : 1));
        if (d.tile) img.tilePositionY = -this.camY * 0.1 / 2;
        else img.y = d.y + drift * d.k;
      }

      // 움직이는 작은 조각은 매 프레임 그림
      if (stage === 2) {            // ASTEROID BELT
        this.drawRocks(this.rocks, 0x6a5d50, alpha * 0.75);
      } else if (stage === 6) {     // KUIPER BELT: 얼음 조각과 멀어진 태양
        this.drawRocks(this.ice, 0x9db6d0, alpha * 0.55);
        const sy = H - 150 + drift;
        bg.fillStyle(0xfff1c8, alpha * 0.15);
        bg.fillCircle(W / 2, sy, 16);
        bg.fillStyle(0xfff6dc, alpha * 0.9);
        bg.fillCircle(W / 2, sy, 4);
      } else if (stage === 8) {     // OORT CLOUD: 혜성 핵
        for (const c of this.comets) {
          const y = this.wrapY(c.y, c.f);
          bg.lineStyle(2, 0xcfe6ff, alpha * 0.25);
          bg.lineBetween(c.x, y, c.x + Math.cos(c.a) * 26, y + Math.sin(c.a) * 26);
          bg.fillStyle(0xe6f3ff, alpha * 0.8);
          bg.fillCircle(c.x, y, 2.5);
        }
      }
    }

    drawRocks(list, color, alpha) {
      const bg = this.bg;
      bg.fillStyle(color, alpha);
      for (const r of list) {
        const y = this.wrapY(r.y, r.f), rot = r.rot + this.t * r.spin;
        bg.fillPoints(r.shape.map((s) => ({ x: r.x + Math.cos(s.a + rot) * s.r, y: y + Math.sin(s.a + rot) * s.r })), true);
      }
    }

    // 장착한 궤적 종류대로 꼬리를 그림. this.trail은 오래된 지점부터 최근 지점 순서.
    drawTrail(g) {
      const tr = this.trail, n = tr.length, col = this.ballColor, t = this.t;
      if (!n) return;
      const start = Math.max(0, n - 22);                       // 대부분은 최근 22개 지점만 사용
      const frac = (i) => (i - start + 1) / (n - start);       // 0(꼬리 끝) ~ 1(공 바로 뒤)

      switch (this.trailStyle) {
        case 'trail_dots':      // 일정 간격으로 남는 점
          for (let i = start; i < n; i++) {
            if (tr[i].q % 4) continue;
            g.fillStyle(col, 0.2 + 0.65 * frac(i));
            g.fillCircle(tr[i].x, tr[i].y, 3.2);
          }
          break;
        case 'trail_ribbon':    // 길게 이어지는 띠
          for (let i = 1; i < n; i++) {
            const f = i / n;
            g.lineStyle(1 + 8 * f, col, 0.12 + 0.6 * f);
            g.lineBetween(tr[i - 1].x, tr[i - 1].y, tr[i].x, tr[i].y);
          }
          break;
        case 'trail_spark':     // 가는 꼬리 주변에 반짝이는 입자
          for (let i = start; i < n; i++) {
            const p = tr[i], f = frac(i);
            g.fillStyle(col, f * 0.35);
            g.fillCircle(p.x, p.y, BALL_R * 0.5 * f);
            if (p.q % 2 === 0) {
              const ox = Math.sin(p.q * 12.9898) * 10, oy = Math.cos(p.q * 78.233) * 10;
              g.fillStyle(0xfff3c4, f * (0.45 + 0.55 * Math.sin(t * 14 + p.q)));
              g.fillRect(p.x + ox - 1.6, p.y + oy - 1.6, 3.2, 3.2);
            }
          }
          break;
        case 'trail_fire':      // 노랑에서 빨강으로 식어가는 불꽃
          for (let i = start; i < n; i++) {
            const p = tr[i], f = frac(i);
            g.fillStyle(f > 0.66 ? 0xffe27a : f > 0.33 ? 0xff9a3c : 0xe0452a, 0.2 + 0.55 * f);
            g.fillCircle(p.x + Math.sin(p.q * 3.1 + t * 10) * 2.5 * (1 - f), p.y, BALL_R * (0.45 + 0.7 * f));
          }
          break;
        case 'trail_rainbow':
          for (let i = start; i < n; i++) {
            const p = tr[i], f = frac(i);
            g.fillStyle(Phaser.Display.Color.HSVToRGB(((p.q * 9) % 360) / 360, 0.75, 1).color, 0.25 + 0.6 * f);
            g.fillCircle(p.x, p.y, BALL_R * (0.35 + 0.6 * f));
          }
          break;
        case 'trail_void':      // 어두운 원에 보랏빛 테두리
          for (let i = start; i < n; i += 2) {
            const p = tr[i], f = frac(i), r = BALL_R * (0.4 + 0.8 * f);
            g.fillStyle(0x12061f, 0.55 * f);
            g.fillCircle(p.x, p.y, r);
            g.lineStyle(1.5, 0xb388ff, 0.75 * f);
            g.strokeCircle(p.x, p.y, r);
          }
          break;
        default: {              // COMET: 기본 혜성 꼬리
          const tint = mixColor(col, 0x9fdcff, 0.5);
          for (let i = start; i < n; i++) {
            const f = frac(i);
            g.fillStyle(tint, f * 0.5);
            g.fillCircle(tr[i].x, tr[i].y, BALL_R * (0.3 + 0.6 * f));
          }
        }
      }
    }

    // ----- 그리기 -----
    draw() {
      const g = this.g, b = this.ball;

      this.drawBackground();

      g.clear();

      // 별
      for (const s of this.stars) {
        if (s.taken) continue;
        const k = (s.big ? 15 : 9) + Math.sin(this.t * 4 + s.x) * 1.5;
        if (s.big) {
          g.lineStyle(2, C.star, 0.5 + 0.3 * Math.sin(this.t * 5));
          g.strokeCircle(s.x, s.y, 21);
        }
        g.fillStyle(C.star, 1);
        g.fillTriangle(s.x, s.y - k, s.x + k * 0.45, s.y, s.x - k * 0.45, s.y);
        g.fillTriangle(s.x, s.y + k, s.x + k * 0.45, s.y, s.x - k * 0.45, s.y);
        g.fillTriangle(s.x - k, s.y, s.x, s.y - k * 0.45, s.x, s.y + k * 0.45);
        g.fillTriangle(s.x + k, s.y, s.x, s.y - k * 0.45, s.x, s.y + k * 0.45);
      }

      // 블랙홀: 주황빛 번짐, 회전하는 강착원반, 검은 원
      for (const h of this.holes) {
        g.fillStyle(0xff8a2a, 0.05);
        for (let k = 0; k < 4; k++) g.fillCircle(h.x, h.y, HOLE_R + 26 - k * 5);
        for (let k = 0; k < 3; k++) {
          const a0 = this.t * (2.4 - k * 0.6) + k * 2.1;
          g.lineStyle(4 - k, k === 0 ? 0xffd9a0 : 0xff9a3c, 0.85 - k * 0.2);
          g.beginPath();
          g.arc(h.x, h.y, HOLE_R + 5 + k * 6, a0, a0 + 3.6, false);
          g.strokePath();
        }
        g.fillStyle(0x000000, 1);
        g.fillCircle(h.x, h.y, HOLE_R);
        g.lineStyle(1.5, 0xffe8c8, 0.9);
        g.strokeCircle(h.x, h.y, HOLE_R);
      }

      // 행성
      for (const p of this.planets) {
        const color = C[p.type];
        const mine = p === b.planet && this.state === 'orbit';
        g.lineStyle(2, color, mine ? 0.3 : 0.45);
        g.strokeCircle(p.x, p.y, p.curOrbit);

        // 콤보 유지 가능 시간(남은 호)
        if (mine && this.started && b.swept < TAU) {
          const remain = 1 - b.swept / TAU;
          g.lineStyle(4, C.star, 0.9);
          g.beginPath();
          g.arc(p.x, p.y, p.curOrbit, -Math.PI / 2, -Math.PI / 2 + remain * TAU, false);
          g.strokePath();
        }

        if (!this.glowOn) {   // 발광 효과가 꺼져 있으면 옅은 빛을 직접 그림
          g.fillStyle(color, 0.1);
          g.fillCircle(p.x, p.y, p.r + 8);
        }
        g.fillStyle(color, 1);
        g.fillCircle(p.x, p.y, p.r);
        g.fillStyle(0xffffff, 0.25);
        g.fillCircle(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.35);

        if (p.type === 'shrink') {
          g.lineStyle(2, 0xffffff, 0.35 + 0.3 * Math.sin(this.t * 8));
          g.strokeCircle(p.x, p.y, p.r + 4);
        } else if (p.type === 'reverse') {
          g.lineStyle(3, 0xffffff, 0.6);
          g.beginPath(); g.arc(p.x, p.y, p.r * 0.55, this.t * 3, this.t * 3 + 4, false); g.strokePath();
        }
      }

      // BEST 기록선(역대 최장 거리 위치)
      if (this.bestLineY !== null) {
        g.lineStyle(2, C.star, 0.55);
        for (let x = 0; x < W; x += 22) g.lineBetween(x, this.bestLineY, x + 11, this.bestLineY);
        this.bestLineLabel.setVisible(true).setY(this.bestLineY - 5);
      }

      // 포획 파동
      for (const r of this.rings) {
        const cx = r.follow ? r.follow.x : r.x;
        g.lineStyle(3, r.color, r.life * 0.8);
        g.strokeCircle(cx, r.y, r.r);
      }

      // 조준선
      if (this.state === 'orbit') {
        const tx = -Math.sin(b.angle) * b.dir, ty = Math.cos(b.angle) * b.dir;
        for (let k = 1; k <= 6; k++) {
          g.fillStyle(0xffffff, 0.8 - k * 0.11);
          g.fillCircle(b.x + tx * k * 22, b.y + ty * k * 22, 3);
        }
      }

      // 꼬리와 공
      this.drawTrail(g);
      if (this.state !== 'dead') {
        if (!this.glowOn) {
          g.fillStyle(this.ballColor, 0.2);
          g.fillCircle(b.x, b.y, BALL_R + 5);
        }
        g.fillStyle(this.ballColor, 1);
        g.fillCircle(b.x, b.y, BALL_R);
      } else if (this.suck && this.suck.k < 1) {
        const s = this.suck, k = s.k * s.k;   // 중심으로 갈수록 빨라짐
        g.fillStyle(this.ballColor, 1);
        g.fillCircle(lerp(s.x, s.hole.x, k), lerp(s.y, s.hole.y, k), BALL_R * (1 - s.k));
      }

      // 경계선
      g.fillStyle(C.lava, 0.22);
      g.fillRect(0, this.lavaY, W, H * 2);
      g.lineStyle(3, C.lava, 0.95);
      g.beginPath();
      for (let x = 0; x <= W; x += 18) {
        const y = this.lavaY + Math.sin(x * 0.05 + this.t * 3) * 5;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  window.orbitGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#070b1a',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W * RES, height: H * RES },
    audio: { noAudio: true },
    render: { powerPreference: 'high-performance' },
    scene: [GameScene],
  });
})();
