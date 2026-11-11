// 저장 데이터와 도전과제 정의. game.js와 ui.js가 함께 씁니다.
window.ORBIT = (() => {
  'use strict';

  const KEY = {
    best: 'orbitjump.best',
    bestCombo: 'orbitjump.bestCombo',
    volume: 'orbitjump.volume',
    history: 'orbitjump.history',
    stats: 'orbitjump.stats',
  };
  const VERSION = '1.4';      // 메뉴 SETTINGS 탭에 표시. 고칠 때마다 올립니다.
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
      at: Number(e && e.at) || 0,
    }));
  };
  const addHistory = (entry) => {
    const h = loadHistory();
    h.unshift(entry);
    setJSON(KEY.history, h.slice(0, HISTORY_MAX));
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
  ];
  const achievement = (id) => ACHIEVEMENTS.find((a) => a.id === id);
  const tierOf = (tiers, value) => tiers.filter((t) => value >= t).length;
  // 도전과제의 현재 값: 행성은 누적 횟수, 점수는 한 번의 시도 최고 점수
  const valueOf = (id) => (id === 'score' ? getNum(KEY.best, 0) : loadStats()[id] || 0);

  return {
    KEY, VERSION, VOLUME_STEPS, HISTORY_MAX, ACHIEVEMENTS,
    getNum, setNum, loadStats, saveStats, loadHistory, addHistory,
    achievement, tierOf, valueOf,
    sfx: null,   // game.js가 채웁니다
  };
})();
