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
  const RES = (() => {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(VIEW.vw / W, VIEW.vh / H) * dpr;
    return clamp(Math.ceil((fit || 1) * 2) / 2, 1, 3);
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
    stage() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, f, 0.5, 'sine', 0.45, i * 0.09)); },
  };
  O.sfx = Sfx;
  // 아이폰은 손을 뗄 때(touchend)나 클릭에서만 소리 재생이 허용됩니다.
  ['touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, () => Sfx.init(), { passive: true }));

  let seenTitle = false;
  const seenTypes = new Set();

  // ---------- 본 게임 ----------
  class GameScene extends Phaser.Scene {
    constructor() { super('game'); }

    create() {
      this.state = 'orbit';       // orbit | fly | dead
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
      this.stage = 0;                                       // 현재 스테이지(0부터)
      this.prevStage = 0;                                   // 배경이 바뀌는 동안의 이전 스테이지
      this.themeMix = 1;                                    // 이전 -> 현재 배경 전환 진행도(0~1)

      this.planets = [];
      this.stars = [];
      this.rings = [];
      this.trail = [];
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

      this.bg = this.add.graphics().setScrollFactor(0).setDepth(0);
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

      // 발광 효과(WebGL에서만)
      try {
        if (this.game.renderer.type === Phaser.WEBGL && this.cameras.main.postFX) {
          this.cameras.main.postFX.addBloom(0xffffff, 1, 1, 1, 0.55, 4);
        }
      } catch (e) { /* 효과 없이 진행 */ }

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
      this.comboText.setY(top + 128);
      // 노치가 있는 기기는 상태 표시줄 바로 아래가 흐리게 처리되므로 조금 더 내림
      this.bestText.setY(top + (top > 0 ? 50 : 22));
      this.toastText.setY(top + 180);
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
      this.showBanner(stage);
      Sfx.stage();
    }

    achieved(name, level) {
      this.toast('ACHIEVEMENT  ' + name + '  LV ' + level, '#ffd166');
      Sfx.achieve();
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

        // 두 행성 사이의 별(고정 행성 사이에만)
        if (i >= 2 && p.type !== 'moving' && prev.type !== 'moving' && Math.random() < 0.55) {
          const mx = (prev.x + p.x) / 2, my = (prev.y + p.y) / 2;
          const dx = p.x - prev.x, dy = p.y - prev.y, len = Math.hypot(dx, dy) || 1;
          const off = rnd(-40, 40);
          this.stars.push({ x: clamp(mx - dy / len * off, 20, W - 20), y: my + dx / len * off, taken: false });
        }
      }
      this.planets.push(p);
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
        if (lv >= 0) this.achieved(ach.name, lv + 1);
        const stage = O.stageOf(p.index);
        if (stage !== this.stage) this.enterStage(stage);
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
      if (tierUp) this.achieved(O.achievement('score').name, this.scoreTier);
      this.scoreText.setText(String(this.score));
      this.scoreText.setScale(1.25);
      this.tweens.add({ targets: this.scoreText, scale: 1, duration: 180 });
    }

    die() {
      if (this.state === 'dead') return;
      const b = this.ball;
      this.state = 'dead';
      this.deadAt = this.t;
      this.emitter.setParticleTint(0xffffff);
      this.emitter.explode(40, clamp(b.x, 0, W), clamp(b.y, this.camY, this.camY + H));
      this.cameras.main.shake(300, 0.012);
      Sfx.die();

      const newBest = this.score > this.best;
      if (newBest) { this.best = this.score; O.setNum(O.KEY.best, this.best); }
      if (this.maxCombo > this.bestCombo) { this.bestCombo = this.maxCombo; O.setNum(O.KEY.bestCombo, this.bestCombo); }
      O.addHistory({ score: this.score, combo: this.maxCombo, planets: this.jumps, at: Date.now() });

      this.time.delayedCall(350, () => {
        const mid = H / 2 - 140;   // 게임 오버 글자 묶음의 맨 윗줄
        const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setScrollFactor(0).setDepth(9).setAlpha(0);
        const mk = (y, s, size, color) => this.add.text(W / 2, y, s, {
          fontFamily: FONT, fontSize: size + 'px', color, fontStyle: 'bold', align: 'center', resolution: TEXT_RES,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10).setAlpha(0);
        const items = [
          dim,
          mk(mid, 'GAME OVER', 58, '#ffffff'),
          mk(mid + 90, 'SCORE ' + this.score, 40, '#ffffff'),
          mk(mid + 150, newBest ? 'NEW BEST!' : 'BEST ' + this.best, 24, newBest ? '#ffd166' : '#8fa3c8'),
          mk(mid + 190, 'MAX COMBO x' + this.maxCombo + '  ·  ALL-TIME x' + this.bestCombo, 20, '#8fa3c8'),
          mk(mid + 300, this.isTouch() ? 'TAP TO RETRY' : 'SPACE / CLICK TO RETRY', 22, '#cfe3ff'),
        ];
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
              this.addScore(STAR_SCORE);
              this.popup(s.x, s.y - 20, '+' + STAR_SCORE, '#ffd166');
              this.emitter.setParticleTint(C.star);
              this.emitter.explode(10, s.x, s.y);
              Sfx.star();
            }
          }
          if (b.x < -30 || b.x > W + 30 || b.y > this.camY + H + 30 || b.y < this.camY - 200) this.die();
        }
      }

      if (this.state !== 'dead') {
        this.trail.push({ x: b.x, y: b.y });
        if (this.trail.length > 22) this.trail.shift();
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

      if (this.themeMix < 1) this.themeMix = Math.min(1, this.themeMix + dt / 2.5);

      for (const r of this.rings) { r.life -= dt * 2.2; r.r += 90 * dt; }
      this.rings = this.rings.filter((r) => r.life > 0);

      this.draw();
    }

    // ----- 배경 -----
    // 배경에 쓰는 무작위 요소(암석, 얼음 조각, 안개, 혜성, 은하)를 한 번만 만들어 둠
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
      this.fog = Array.from({ length: 10 }, () => ({
        x: Math.random() * W, y: Math.random() * (H + 80), f: rnd(0.05, 0.15), r: rnd(120, 260),
      }));
      this.comets = Array.from({ length: 8 }, () => ({
        x: Math.random() * W, y: Math.random() * (H + 80), f: rnd(0.2, 0.45), a: rnd(0.7, 2.4),
      }));
      this.galaxy = Array.from({ length: 170 }, (_, i) => {
        const u = Math.random();
        return { ang: (i % 2) * Math.PI + u * 5.5 + rnd(-0.25, 0.25), rad: 14 + u * 170 + rnd(-8, 8), r: rnd(0.8, 2), a: rnd(0.25, 0.7) };
      });
    }

    // 카메라 이동에 따라 천천히 흘러가다 화면 밖으로 나가면 반대쪽에서 다시 나오는 y 좌표
    wrapY(y, f) {
      const span = H + 80;
      return (((y - this.camY * f) % span) + span) % span - 40;
    }

    drawBackground() {
      const bg = this.bg, m = this.themeMix;
      const a = THEMES[this.prevStage], b = THEMES[this.stage];
      bg.clear();

      const top = mixColor(a.top, b.top, m), bottom = mixColor(a.bottom, b.bottom, m);
      bg.fillGradientStyle(top, top, bottom, bottom, 1);
      bg.fillRect(0, 0, W, H);

      // 아래쪽(태양 방향)에서 올라오는 빛. 멀어질수록 약해짐.
      const sun = lerp(a.sun, b.sun, m);
      if (sun > 0.01) {
        for (let i = 0; i < 22; i++) {   // 옅은 원을 촘촘히 겹쳐 띠가 보이지 않게 함
          bg.fillStyle(0xffc98a, 0.009 * sun);
          bg.fillCircle(W / 2, H + 300, 420 + i * 32);
        }
      }

      const starColor = mixColor(a.star, b.star, m), starA = lerp(a.starA, b.starA, m);
      for (const s of this.bgStars) {
        const y = (((s.y - this.camY * s.f) % H) + H) % H;
        bg.fillStyle(starColor, Math.min(1, s.a * starA * (0.7 + 0.3 * Math.sin(this.t * 2 + s.tw))));
        bg.fillCircle(s.x, y, s.r);
      }

      if (m < 1) this.drawBackdrop(this.prevStage, 1 - m, this.prevCamY0);
      this.drawBackdrop(this.stage, m, this.camY0);
    }

    // 가로 줄무늬가 있는 원(목성, 토성). 매끈한 원 위에 가로 띠를 얹어 그림.
    bandedDisc(cx, cy, R, base, bands, alpha) {
      const bg = this.bg, step = 4, inner = R - 1.5;
      bg.fillStyle(base, alpha);
      bg.fillCircle(cx, cy, R);
      for (let dy = -inner; dy < inner; dy += step) {
        if (cy + dy > H || cy + dy + step < 0) continue;
        const mid = dy + step / 2;
        const half = Math.sqrt(Math.max(0, inner * inner - mid * mid));
        const u = (mid + inner) / (2 * inner);
        const col = bands[Math.min(bands.length - 1, Math.floor(u * bands.length))];
        if (col === base) continue;
        bg.fillStyle(col, alpha);
        bg.fillRect(cx - half, cy + dy, half * 2, step);
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

    // 스테이지별 배경 천체. alpha는 전환 중 서서히 나타나고 사라지는 정도.
    drawBackdrop(stage, alpha, camY0) {
      if (alpha <= 0.01) return;
      const bg = this.bg, t = this.t;
      const drift = (camY0 - this.camY) * 0.1;   // 위로 올라갈수록 배경 천체는 천천히 아래로

      switch (stage) {
        case 0: {   // EARTH: 화면 아래의 커다란 지구
          const R = 760, cx = W / 2, cy = H + 560 + drift * 1.5, topY = cy - R;
          bg.fillStyle(0x144a8f, alpha);
          bg.fillCircle(cx, cy, R);
          bg.fillStyle(0x2c7a52, alpha * 0.9);
          bg.fillEllipse(cx - 120, topY + 62, 150, 46);
          bg.fillEllipse(cx + 135, topY + 95, 190, 60);
          bg.fillStyle(0xffffff, alpha * 0.22);
          bg.fillEllipse(cx + 20, topY + 40, 120, 22);
          bg.fillEllipse(cx - 190, topY + 120, 140, 26);
          bg.lineStyle(5, 0x7fd0ff, alpha * 0.45);
          bg.strokeCircle(cx, cy, R + 2);
          bg.lineStyle(16, 0x7fd0ff, alpha * 0.12);
          bg.strokeCircle(cx, cy, R + 12);
          break;
        }
        case 1: {   // MARS
          const cx = 425, cy = 300 + drift, R = 120, al = alpha * 0.75;
          bg.fillStyle(0x8a4226, al);
          bg.fillCircle(cx, cy, R);
          bg.fillStyle(0x6b2f1c, al);
          bg.fillEllipse(cx - 30, cy + 20, 110, 44);
          bg.fillEllipse(cx + 45, cy - 40, 70, 30);
          bg.fillEllipse(cx + 20, cy + 70, 60, 22);
          bg.fillStyle(0xf2e6dc, al * 0.8);
          bg.fillEllipse(cx, cy - R + 11, 58, 14);
          bg.lineStyle(3, 0xd98a5f, al * 0.5);
          bg.strokeCircle(cx, cy, R);
          break;
        }
        case 2:     // ASTEROID BELT
          this.drawRocks(this.rocks, 0x6a5d50, alpha * 0.75);
          break;
        case 3: {   // JUPITER: 왼쪽에 걸친 거대한 줄무늬 행성
          const cx = 30, cy = 440 + drift, R = 380, al = alpha * 0.45;
          this.bandedDisc(cx, cy, R, 0x6b5140,
            [0x6b5140, 0x8a6a4d, 0x5a4032, 0x94775a, 0x6b5140, 0x8f7155, 0x5c4334, 0x80634a, 0x6b5140, 0x5a4032, 0x7a5c44], al);
          bg.fillStyle(0x8a3f2a, al);
          bg.fillEllipse(cx + 215, cy + 95, 76, 42);
          bg.lineStyle(3, 0xb89a78, al * 0.5);
          bg.strokeCircle(cx, cy, R);
          break;
        }
        case 4: {   // SATURN: 기울어진 고리
          const cx = 385, cy = 340 + drift, R = 105, al = alpha * 0.7, tilt = -0.35;
          const ct = Math.cos(tilt), st = Math.sin(tilt);
          const ring = (rx, ry, a0, a1, w, col, ra) => {
            const pts = [];
            for (let i = 0; i <= 28; i++) {
              const ang = a0 + (a1 - a0) * i / 28, ex = Math.cos(ang) * rx, ey = Math.sin(ang) * ry;
              pts.push({ x: cx + ex * ct - ey * st, y: cy + ex * st + ey * ct });
            }
            bg.lineStyle(w, col, ra);
            bg.strokePoints(pts, false);
          };
          const rings = [[235, 62, 9, 0xb8a67a, 0.5], [205, 54, 12, 0x9c8a60, 0.6], [172, 45, 7, 0xc9b88c, 0.4]];
          rings.forEach(([rx, ry, w, col, ra]) => ring(rx, ry, Math.PI, TAU, w, col, al * ra));       // 뒤쪽 절반
          this.bandedDisc(cx, cy, R, 0x8f7d55, [0x8f7d55, 0xa8956a, 0x80704c, 0x9c8a60, 0x8f7d55, 0x7a6a48], al);
          rings.forEach(([rx, ry, w, col, ra]) => ring(rx, ry, 0, Math.PI, w, col, al * ra));         // 앞쪽 절반
          break;
        }
        case 5: {   // ICE GIANTS: 천왕성과 해왕성
          const al = alpha * 0.5;
          bg.fillStyle(0x5a9c9c, al);
          bg.fillCircle(125, 300 + drift, 95);
          bg.lineStyle(3, 0xc4f2f2, al * 0.45);
          bg.strokeCircle(125, 300 + drift, 95);
          const ny = 660 + drift * 1.4;
          bg.fillStyle(0x2f4fb0, al);
          bg.fillCircle(440, ny, 70);
          bg.fillStyle(0x24408f, al);
          bg.fillEllipse(425, ny + 12, 80, 18);
          bg.lineStyle(3, 0x86a4ff, al * 0.45);
          bg.strokeCircle(440, ny, 70);
          break;
        }
        case 6: {   // KUIPER BELT: 드문 얼음 조각과 멀어진 태양
          this.drawRocks(this.ice, 0x9db6d0, alpha * 0.55);
          const sy = H - 150 + drift;
          bg.fillStyle(0xfff1c8, alpha * 0.15);
          bg.fillCircle(W / 2, sy, 16);
          bg.fillStyle(0xfff6dc, alpha * 0.9);
          bg.fillCircle(W / 2, sy, 4);
          break;
        }
        case 7: {   // HELIOPAUSE: 태양풍이 멈추는 경계의 물결
          const cy = H + 1100 + drift * 2;
          [1380, 1450, 1540, 1650].forEach((r, i) => {
            const pulse = 0.6 + 0.4 * Math.sin(t * 1.2 + i * 1.3);
            bg.lineStyle(4 + i * 3, i % 2 ? 0x5c7cff : 0x8a5cff, alpha * 0.16 * pulse);
            bg.strokeCircle(W / 2, cy, r);
          });
          break;
        }
        case 8: {   // OORT CLOUD: 옅은 안개와 혜성 핵
          for (const f of this.fog) {
            const fy = this.wrapY(f.y, f.f);
            bg.fillStyle(0x9fb4c8, alpha * 0.008);   // 여러 겹으로 겹쳐 가장자리가 흐려지게 함
            for (let k = 0; k < 6; k++) bg.fillCircle(f.x, fy, f.r * (1 - k * 0.15));
          }
          for (const c of this.comets) {
            const y = this.wrapY(c.y, c.f);
            bg.lineStyle(2, 0xcfe6ff, alpha * 0.25);
            bg.lineBetween(c.x, y, c.x + Math.cos(c.a) * 26, y + Math.sin(c.a) * 26);
            bg.fillStyle(0xe6f3ff, alpha * 0.8);
            bg.fillCircle(c.x, y, 2.5);
          }
          break;
        }
        default: {  // BEYOND: 멀리 보이는 은하
          const cx = W * 0.6, cy = 320 + drift, tilt = -0.5, ct = Math.cos(tilt), st = Math.sin(tilt);
          for (let i = 0; i < 4; i++) {
            bg.fillStyle(0xfff0d0, alpha * 0.07);
            bg.fillCircle(cx, cy, 12 + i * 11);
          }
          for (const p of this.galaxy) {
            const ang = p.ang + t * 0.02, ex = Math.cos(ang) * p.rad, ey = Math.sin(ang) * p.rad * 0.45;
            bg.fillStyle(0xcdb8ff, alpha * p.a);
            bg.fillCircle(cx + ex * ct - ey * st, cy + ex * st + ey * ct, p.r);
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
        const k = 9 + Math.sin(this.t * 4 + s.x) * 1.5;
        g.fillStyle(C.star, 1);
        g.fillTriangle(s.x, s.y - k, s.x + k * 0.45, s.y, s.x - k * 0.45, s.y);
        g.fillTriangle(s.x, s.y + k, s.x + k * 0.45, s.y, s.x - k * 0.45, s.y);
        g.fillTriangle(s.x - k, s.y, s.x, s.y - k * 0.45, s.x, s.y + k * 0.45);
        g.fillTriangle(s.x + k, s.y, s.x, s.y - k * 0.45, s.x, s.y + k * 0.45);
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
      const n = this.trail.length;
      for (let i = 0; i < n; i++) {
        const f = (i + 1) / n;
        g.fillStyle(0x9fdcff, f * 0.5);
        g.fillCircle(this.trail[i].x, this.trail[i].y, BALL_R * (0.3 + 0.6 * f));
      }
      if (this.state !== 'dead') {
        g.fillStyle(C.ball, 1);
        g.fillCircle(b.x, b.y, BALL_R);
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
    scene: [GameScene],
  });
})();
