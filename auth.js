/* ============================================
   TV Fun — auth.js  (carregado em todas as páginas)
   ============================================ */
const TVFunAuth = (() => {
  'use strict';

  const K = { users: 'tvfun_users', session: 'tvfun_session' };

  const PLANS = {
    basico:  { name: 'Básico',   badge: '🔵', prices: { mensal: 24.90, trimestral: 59.90, semestral: 99.90, anual: 179.90 }, screens: 1, quality: 'HD',       channels: '10.000+' },
    padrao:  { name: 'Padrão',   badge: '🟣', prices: { mensal: 39.90, trimestral: 99.90, semestral: 179.90, anual: 299.90 }, screens: 2, quality: 'Full HD',  channels: '20.000+' },
    premium: { name: 'Premium',  badge: '🟡', prices: { mensal: 59.90, trimestral: 149.90, semestral: 269.90, anual: 449.90 }, screens: 4, quality: 'Ultra HD', channels: '50.000+' },
  };

  const DURATION_MONTHS = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };

  // ── hash simples (demo) ──────────────────
  function hashPw(pw) {
    let h = 5381;
    for (let i = 0; i < pw.length; i++) h = (((h << 5) + h) ^ pw.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  // ── storage ──────────────────────────────
  function getUsers() { try { return JSON.parse(localStorage.getItem(K.users) || '{}'); } catch { return {}; } }
  function saveUsers(u) { localStorage.setItem(K.users, JSON.stringify(u)); }
  function getSession() { try { return JSON.parse(localStorage.getItem(K.session) || 'null'); } catch { return null; } }
  function saveSession(s) { localStorage.setItem(K.session, JSON.stringify(s)); }

  // ── auth ─────────────────────────────────
  function isLoggedIn() { const s = getSession(); return !!(s && s.exp > Date.now()); }

  function getCurrentUser() {
    const s = getSession();
    if (!s || s.exp < Date.now()) return null;
    return getUsers()[s.email] || null;
  }

  function login(email, password) {
    const users = getUsers();
    const e = email.toLowerCase().trim();
    const u = users[e];
    if (!u) return { error: 'E-mail não encontrado.' };
    if (u.password !== hashPw(password)) return { error: 'Senha incorreta.' };
    saveSession({ email: e, exp: Date.now() + 7 * 86_400_000 });
    return { ok: true, user: u };
  }

  function register({ name, email, password }) {
    const users = getUsers();
    const e = email.toLowerCase().trim();
    if (users[e]) return { error: 'E-mail já cadastrado.' };
    users[e] = {
      name: name.trim(),
      email: e,
      password: hashPw(password),
      plan: null, planName: null, planDuration: null, planExpiry: null,
      createdAt: new Date().toISOString(),
    };
    saveUsers(users);
    return login(e, password);
  }

  function logout() { localStorage.removeItem(K.session); window.location.href = 'login.html'; }

  function requireAuth() {
    if (!isLoggedIn()) { window.location.href = 'login.html'; return false; }
    return true;
  }

  function updateUser(data) {
    const s = getSession();
    if (!s) return false;
    const users = getUsers();
    if (!users[s.email]) return false;
    Object.assign(users[s.email], data);
    saveUsers(users);
    return true;
  }

  function activatePlan(planKey, duration) {
    const months = DURATION_MONTHS[duration] || 1;
    const expiry = new Date(Date.now() + months * 30 * 86_400_000).toISOString();
    updateUser({ plan: planKey, planName: PLANS[planKey]?.name, planDuration: duration, planExpiry: expiry });
    return { expiry };
  }

  function isPlanActive() {
    const u = getCurrentUser();
    return !!(u?.plan && u?.planExpiry && new Date(u.planExpiry) > new Date());
  }

  function planExpiryLabel() {
    const u = getCurrentUser();
    if (!u?.planExpiry) return null;
    return new Date(u.planExpiry).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  // ── demo user ────────────────────────────
  function ensureDemo() {
    const users = getUsers();
    if (!users['demo@tvfun.com']) {
      users['demo@tvfun.com'] = {
        name: 'Demo', email: 'demo@tvfun.com', password: hashPw('demo123'),
        plan: 'premium', planName: 'Premium', planDuration: 'mensal',
        planExpiry: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      saveUsers(users);
    }
  }
  ensureDemo();

  return { isLoggedIn, getCurrentUser, login, register, logout, requireAuth, updateUser, activatePlan, isPlanActive, planExpiryLabel, PLANS, DURATION_MONTHS };
})();
