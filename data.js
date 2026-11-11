// 저장 데이터와 도전과제 정의. game.js와 ui.js가 함께 씁니다.
window.ORBIT = (() => {
  'use strict';

  const KEY = {
    best: 'orbitjump.best',
    bestCombo: 'orbitjump.bestCombo',
    bestDist: 'orbitjump.bestDist',     // 가장 멀리 간 행성 번호(거리는 distanceAU로 환산)
    newAch: 'orbitjump.newAch',         // 아직 확인하지 않은 새 도전과제가 있으면 1
    shake: 'orbitjump.shake',           // 게임 오버 때 화면 흔들림(저장값이 없으면 켬)
    showFps: 'orbitjump.showFps',       // 초당 프레임 수 표시(1이면 켬)
    glow: 'orbitjump.glow',             // 화면 전체 발광 효과(저장값이 없으면 PC는 켬, 폰은 끔)
    stars: 'orbitjump.stars',           // 보유 별(꾸미기 항목을 사는 데 씀)
    owned: 'orbitjump.owned',           // 구매한 꾸미기 항목 id 목록
    equip: 'orbitjump.equip',           // 장착 중인 항목 { ball, trail }
    volume: 'orbitjump.volume',
    history: 'orbitjump.history',
    stats: 'orbitjump.stats',
  };
  const VERSION = '1.15';      // 메뉴 SETTINGS 탭에 표시. 고칠 때마다 올립니다.
  const VOLUME_STEPS = 5;     // 0(끔) ~ 5
  const HISTORY_MAX = 10;

  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경 */ } };

  const getNum = (k, d) => {
    const v = read(k);
    if (v === null) return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const setNum = (k, n) => write(k, String(n));
  const getJSON = (k, d) => {
    const v = read(k);
    if (v === null) return d;
    try { return JSON.parse(v); } catch (e) { return d; }
  };
  const setJSON = (k, o) => write(k, JSON.stringify(o));

  // 행성 종류별 누적 착지 횟수
  const loadStats = () => {
    const s = getJSON(KEY.stats, {}) || {};
    const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
    return { normal: num(s.normal), moving: num(s.moving), reverse: num(s.reverse), shrink: num(s.shrink) };
  };
  const saveStats = (s) => setJSON(KEY.stats, s);

  // 최근 시도 기록(최신이 앞)
  const loadHistory = () => {
    const h = getJSON(KEY.history, []);
    if (!Array.isArray(h)) return [];
    return h.slice(0, HISTORY_MAX).map((e) => ({
      score: Number(e && e.score) || 0,
      combo: Number(e && e.combo) || 0,
      planets: Number(e && e.planets) || 0,
      dist: e && Number.isFinite(Number(e.dist)) && e.dist !== null && e.dist !== undefined ? Number(e.dist) : -1,   // 예전 기록은 -1
      at: Number(e && e.at) || 0,
    }));
  };
  const addHistory = (entry) => {
    const h = loadHistory();
    h.unshift(entry);
    setJSON(KEY.history, h.slice(0, HISTORY_MAX));
  };

  // 스테이지: 행성 STAGE_LEN개마다 다음으로 넘어감. au는 그 구간의 태양까지 거리(시작, 끝).
  const STAGE_LEN = 8;
  const STAGES = [
    { name: 'EARTH', au: [1, 1.4] },
    { name: 'MARS', au: [1.5, 2.1] },
    { name: 'ASTEROID BELT', au: [2.2, 3.2] },
    { name: 'JUPITER', au: [5.2, 9] },
    { name: 'SATURN', au: [9.5, 18] },
    { name: 'ICE GIANTS', au: [19, 30] },
    { name: 'KUIPER BELT', au: [30, 50] },
    { name: 'HELIOPAUSE', au: [90, 150] },
    { name: 'OORT CLOUD', au: [2000, 100000] },
    { name: 'BEYOND', au: [100000, 100000] },   // 마지막 스테이지는 끝없이 이어짐
  ];
  // 옮겨 탄 행성 수(index) -> 스테이지 번호(0부터)
  const stageOf = (index) => Math.min(STAGES.length - 1, Math.floor(Math.max(0, index) / STAGE_LEN));
  // 옮겨 탄 행성 수 -> 태양까지 거리(AU). 구간 안에서는 뒤로 갈수록 빠르게 늘어남.
  const distanceAU = (index) => {
    const s = stageOf(index), into = Math.max(0, index) - s * STAGE_LEN;
    const [a, b] = STAGES[s].au;
    if (s === STAGES.length - 1) return a * Math.pow(1.12, into);
    return a * Math.pow(b / a, into / STAGE_LEN);
  };
  const formatAU = (v) => {
    if (!(v > 0)) return '-';
    if (v < 10) return v.toFixed(1);
    if (v < 1000) return String(Math.round(v));
    return Number(v.toPrecision(3)).toLocaleString('en-US');
  };

  // 도전과제: 종목마다 10단계
  const PLANET_TIERS_COMMON = [10, 25, 50, 100, 200, 400, 700, 1000, 1500, 2500];
  const PLANET_TIERS_RARE = [5, 10, 25, 50, 100, 200, 350, 500, 750, 1000];
  const ACHIEVEMENTS = [
    { id: 'normal', name: 'BLUE PLANETS', unit: 'landings', color: '#4cc9f0', tiers: PLANET_TIERS_COMMON },
    { id: 'moving', name: 'MOVING PLANETS', unit: 'landings', color: '#80ed99', tiers: PLANET_TIERS_RARE },
    { id: 'reverse', name: 'REVERSE PLANETS', unit: 'landings', color: '#b388ff', tiers: PLANET_TIERS_RARE },
    { id: 'shrink', name: 'SHRINKING PLANETS', unit: 'landings', color: '#ff6b6b', tiers: PLANET_TIERS_RARE },
    { id: 'score', name: 'HIGH SCORE', unit: 'points in one run', color: '#ffd166',
      tiers: [10, 25, 50, 100, 200, 350, 500, 750, 1000, 1500] },
    // 도달한 스테이지 번호(1 = EARTH ... 10 = BEYOND)
    { id: 'stage', name: 'EXPLORER', unit: 'stage reached', color: '#f4a261', tiers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  ];
  const achievement = (id) => ACHIEVEMENTS.find((a) => a.id === id);
  const tierOf = (tiers, value) => tiers.filter((t) => value >= t).length;
  // 도전과제의 현재 값: 행성은 누적 횟수, 점수는 한 번의 시도 최고 점수
  const valueOf = (id) => {
    if (id === 'score') return getNum(KEY.best, 0);
    if (id === 'stage') {   // 행성에 한 번이라도 옮겨 탔으면 1(EARTH)부터
      const far = getNum(KEY.bestDist, 0);
      return far >= 1 ? stageOf(far) + 1 : 0;
    }
    return loadStats()[id] || 0;
  };

  // ---------- 별과 꾸미기 ----------
  // price: 별 가격(0이면 기본 제공). unlock: 별로 살 수 없고 도전과제 단계를 달성하면 열림.
  const COSMETICS = {
    ball: [
      { id: 'ball_white', name: 'WHITE', color: '#ffffff', price: 0 },
      { id: 'ball_sky', name: 'SKY', color: '#7fdcff', price: 10 },
      { id: 'ball_lime', name: 'LIME', color: '#b6f36a', price: 20 },
      { id: 'ball_gold', name: 'GOLD', color: '#ffd166', price: 35 },
      { id: 'ball_pink', name: 'PINK', color: '#ff8fc7', price: 50 },
      { id: 'ball_ember', name: 'EMBER', color: '#ff9a3c', price: 70 },
      { id: 'ball_violet', name: 'VIOLET', color: '#b388ff', price: 100 },
      { id: 'ball_crimson', name: 'CRIMSON', color: '#ff5d5d', price: 150 },
      { id: 'ball_aurora', name: 'AURORA', color: '#7dffc8', unlock: { ach: 'score', level: 6 } },
    ],
    trail: [
      { id: 'trail_comet', name: 'COMET', price: 0 },
      { id: 'trail_dots', name: 'DOTS', price: 15 },
      { id: 'trail_ribbon', name: 'RIBBON', price: 30 },
      { id: 'trail_spark', name: 'SPARKLE', price: 60 },
      { id: 'trail_fire', name: 'FIRE', price: 100 },
      { id: 'trail_rainbow', name: 'RAINBOW', price: 180 },
      { id: 'trail_void', name: 'VOID', unlock: { ach: 'stage', level: 10 } },
    ],
  };
  const allItems = () => COSMETICS.ball.concat(COSMETICS.trail);
  const getStars = () => Math.max(0, Math.floor(getNum(KEY.stars, 0)));
  const addStars = (n) => { const v = getStars() + n; setNum(KEY.stars, v); return v; };
  const ownedIds = () => {
    const o = getJSON(KEY.owned, []);
    return Array.isArray(o) ? o.filter((x) => typeof x === 'string') : [];
  };
  const isUnlocked = (it) => {
    if (it.unlock) {
      const a = achievement(it.unlock.ach);
      return tierOf(a.tiers, valueOf(a.id)) >= it.unlock.level;
    }
    return it.price === 0 || ownedIds().includes(it.id);
  };
  // 별이 충분하면 차감하고 구매 목록에 추가
  const buy = (id) => {
    const it = allItems().find((x) => x.id === id);
    if (!it || it.unlock || isUnlocked(it)) return false;
    const have = getStars();
    if (have < it.price) return false;
    setNum(KEY.stars, have - it.price);
    setJSON(KEY.owned, ownedIds().concat(id));
    return true;
  };
  // 장착 중인 항목. 저장된 값이 없거나 잠긴 항목이면 기본 항목으로.
  const getEquip = () => {
    const e = getJSON(KEY.equip, {}) || {};
    const pick = (kind) => {
      const it = COSMETICS[kind].find((x) => x.id === e[kind]);
      return it && isUnlocked(it) ? it : COSMETICS[kind][0];
    };
    return { ball: pick('ball'), trail: pick('trail') };
  };
  const equip = (kind, id) => {
    const it = COSMETICS[kind].find((x) => x.id === id);
    if (!it || !isUnlocked(it)) return false;
    const e = getJSON(KEY.equip, {}) || {};
    e[kind] = id;
    setJSON(KEY.equip, e);
    return true;
  };
  // 도전과제 achId가 fromLevel 초과 ~ toLevel 이하 단계에서 여는 항목들
  const rewardsFor = (achId, fromLevel, toLevel) => allItems().filter((x) =>
    x.unlock && x.unlock.ach === achId && x.unlock.level > fromLevel && x.unlock.level <= toLevel);

  // 터치로 조작하는 기기(폰, 태블릿)
  const isMobile = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  return {
    isMobile,
    COSMETICS, getStars, addStars, isUnlocked, buy, getEquip, equip, rewardsFor,
    KEY, VERSION, VOLUME_STEPS, HISTORY_MAX, ACHIEVEMENTS,
    STAGE_LEN, STAGES, stageOf, distanceAU, formatAU,
    getNum, setNum, loadStats, saveStats, loadHistory, addHistory,
    achievement, tierOf, valueOf,
    sfx: null,   // game.js가 채웁니다
  };
})();
