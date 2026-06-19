/* TV Fun — conta.js */
(function () {
  'use strict';

  // ===== STORAGE =====
  const STORAGE_KEY = 'tvfun_conta';

  function loadData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }
  function saveData(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }

  // ===== TOAST =====
  function toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.borderColor = isError ? 'rgba(229,9,20,.4)' : 'rgba(255,255,255,.12)';
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ===== SIDEBAR NAV =====
  function setupNav() {
    document.querySelectorAll('.side-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const sec = link.dataset.sec;
        document.querySelectorAll('.side-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
        link.classList.add('active');
        const target = document.getElementById('sec-' + sec);
        if (target) target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // ===== LOAD SAVED PROFILE =====
  function loadProfile() {
    const d = loadData();
    if (!d.nome) return;
    setVal('fieldNome', d.nome);
    setVal('fieldDisplay', d.display);
    setVal('fieldEmail', d.email);
    setVal('fieldTel', d.tel);
    setVal('fieldNasc', d.nasc);
    setVal('fieldPais', d.pais);
    setVal('fieldBio', d.bio);
    if (d.display) {
      document.getElementById('ucName').textContent = d.display;
    }
    if (d.email) {
      document.getElementById('ucEmail').textContent = d.email;
    }
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  }

  // ===== FORM: PERFIL =====
  function setupFormPerfil() {
    const form = document.getElementById('formPerfil');
    form.addEventListener('submit', e => {
      e.preventDefault();

      const nome = document.getElementById('fieldNome').value.trim();
      const email = document.getElementById('fieldEmail').value.trim();

      if (!nome) { toast('⚠ Nome não pode ficar em branco', true); return; }
      if (!email.includes('@')) { toast('⚠ E-mail inválido', true); return; }

      const d = loadData();
      d.nome = nome;
      d.display = document.getElementById('fieldDisplay').value.trim() || nome.split(' ')[0];
      d.email = email;
      d.tel = document.getElementById('fieldTel').value.trim();
      d.nasc = document.getElementById('fieldNasc').value;
      d.pais = document.getElementById('fieldPais').value;
      d.bio = document.getElementById('fieldBio').value.trim();
      saveData(d);

      document.getElementById('ucName').textContent = d.display;
      document.getElementById('ucEmail').textContent = d.email;
      document.getElementById('avatarPreview').textContent = d.display[0].toUpperCase();

      toast('✓ Perfil atualizado com sucesso!');
    });

    document.getElementById('btnCancelPerfil').addEventListener('click', () => {
      loadProfile();
      toast('Alterações descartadas.');
    });
  }

  // ===== AVATAR UPLOAD =====
  function setupAvatar() {
    const btn = document.getElementById('btnChangeAvatar');
    const input = document.getElementById('avatarInput');
    const preview = document.getElementById('avatarPreview');

    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('⚠ Imagem muito grande (máx. 5 MB)', true); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        preview.innerHTML = `<img src="${ev.target.result}" alt="Avatar">`;
        toast('✓ Foto de perfil atualizada!');
      };
      reader.readAsDataURL(file);
    });
  }

  // ===== PASSWORD FORM =====
  function setupFormSenha() {
    const form = document.getElementById('formSenha');
    const fieldNova = document.getElementById('fieldSenhaNova');
    const strength = document.getElementById('passStrength');

    fieldNova.addEventListener('input', () => {
      const v = fieldNova.value;
      let score = 0;
      if (v.length >= 8) score++;
      if (/[A-Z]/.test(v)) score++;
      if (/[0-9]/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;

      const pct = (score / 4) * 100;
      const color = score <= 1 ? '#E50914' : score === 2 ? '#f5c518' : score === 3 ? '#1db954' : '#1db954';
      strength.style.setProperty('--strength', pct + '%');
      strength.style.setProperty('--strength-color', color);
    });

    document.querySelectorAll('.show-pass').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) target.type = target.type === 'password' ? 'text' : 'password';
      });
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const atual = document.getElementById('fieldSenhaAtual').value;
      const nova = document.getElementById('fieldSenhaNova').value;
      const conf = document.getElementById('fieldSenhaConf').value;

      if (!atual) { toast('⚠ Digite sua senha atual', true); return; }
      if (nova.length < 8) { toast('⚠ Nova senha precisa ter no mínimo 8 caracteres', true); return; }
      if (nova !== conf) { toast('⚠ As senhas não coincidem', true); return; }

      if (typeof TVFunDB !== 'undefined' && TVFunDB.client) {
        const { error } = await TVFunDB.client.auth.updateUser({ password: nova });
        if (error) { toast('⚠ ' + error.message, true); return; }
      }
      form.reset();
      strength.style.setProperty('--strength', '0%');
      toast('✓ Senha atualizada com sucesso!');
    });
  }

  // ===== 2FA TOGGLE =====
  function setup2FA() {
    const toggle = document.getElementById('toggle2fa');
    const detail = document.getElementById('twofa-detail');
    toggle.addEventListener('change', () => {
      detail.classList.toggle('hidden', !toggle.checked);
      toast(toggle.checked ? '✓ Verificação em duas etapas ativada' : 'Verificação em duas etapas desativada');
    });
  }

  // ===== SESSIONS =====
  function setupSessions() {
    document.getElementById('btnEncerrarTudo').addEventListener('click', () => {
      const list = document.getElementById('sessionsList');
      const items = list.querySelectorAll('.session-item');
      let removed = 0;
      items.forEach(item => {
        if (!item.querySelector('.session-current')) {
          item.style.transition = 'opacity .3s, max-height .3s';
          item.style.opacity = '0';
          item.style.maxHeight = '0';
          item.style.overflow = 'hidden';
          item.style.padding = '0';
          setTimeout(() => item.remove(), 300);
          removed++;
        }
      });
      if (removed === 0) {
        toast('Nenhuma outra sessão ativa.');
      } else {
        toast(`✓ ${removed} sessão(ões) encerrada(s)`);
      }
    });
  }

  // ===== PARENTAL CONTROL =====
  function setupParental() {
    const toggle = document.getElementById('prefParental');
    const detail = document.getElementById('parentalDetail');
    toggle.addEventListener('change', () => {
      detail.classList.toggle('hidden', !toggle.checked);
    });
  }

  // ===== SAVE PREFERENCES =====
  function setupPrefs() {
    document.getElementById('btnSalvarPrefs').addEventListener('click', () => {
      const d = loadData();
      d.prefs = {
        qual: document.getElementById('prefQual').value,
        autoplay: document.getElementById('prefAutoplay').checked,
        preview: document.getElementById('prefPreview').checked,
        idioma: document.getElementById('prefIdioma').value,
        audio: document.getElementById('prefAudio').value,
        leg: document.getElementById('prefLeg').value,
        notifLanc: document.getElementById('notifLanc').checked,
        notifRec: document.getElementById('notifRec').checked,
        notifPromo: document.getElementById('notifPromo').checked,
        parental: document.getElementById('prefParental').checked,
      };
      saveData(d);
      toast('✓ Preferências salvas!');
    });
  }

  // ===== LOGOUT =====
  function setupLogout() {
    document.getElementById('btnLogout').addEventListener('click', () => {
      if (confirm('Deseja sair da sua conta TV Fun?')) {
        toast('Até logo! 👋');
        setTimeout(() => window.location.href = 'index.html', 1200);
      }
    });
  }

  // ===== CANCEL PLAN =====
  function setupCancel() {
    const btn = document.getElementById('btnCancelar');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!confirm('Tem certeza que deseja cancelar sua assinatura?\n\nVocê manterá o acesso até o fim do período já pago.')) return;
      if (typeof TVFunDB !== 'undefined') {
        const ok = await TVFunDB.cancelActiveSubscription();
        if (!ok) { toast('⚠ Não foi possível cancelar agora.', true); return; }
      }
      toast('Assinatura cancelada. Você mantém o acesso até o fim do período pago.');
    });
  }

  // ===== CHANGE CARD =====
  function setupCard() {
    const btn = document.getElementById('btnChangeCard');
    if (!btn) return;
    btn.addEventListener('click', () => {
      toast('Redirecionando para o gateway de pagamento...');
    });
  }

  // ===== AUTH INTEGRATION (Supabase) =====
  // ===== HELPERS DE RENDER (dados reais) =====
  const fmtBRL = (v) => v != null ? ('R$ ' + Number(v).toFixed(2).replace('.', ',')) : '—';
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return '—'; } };
  const METHOD_LABEL = { pix: 'PIX', card: 'Cartão', boleto: 'Boleto' };
  const setText = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };

  function renderCurrentPlan(sub) {
    if (!sub) {
      setText('curPlanBadge', 'Sem plano ativo');
      const r = document.getElementById('curPlanRenew'); if (r) r.innerHTML = 'Você está sem assinatura ativa.';
      setText('curPlanPrice', '—'); setText('curPayMethod', '—');
      return;
    }
    const v = TVFunDB.PLANS[sub.plan]?.prices?.[sub.duration];
    const badge = TVFunDB.PLANS[sub.plan]?.badge || '✦';
    setText('curPlanBadge', `${badge} Plano ${sub.plan_name || sub.plan}`);
    const renew = document.getElementById('curPlanRenew');
    if (renew) renew.innerHTML = `Válido até <strong>${fmtDate(sub.expires_at)}</strong>`;
    const months = TVFunDB.DURATION_MONTHS[sub.duration] || 1;
    const priceEl = document.getElementById('curPlanPrice');
    if (priceEl) priceEl.innerHTML = `${fmtBRL(sub.amount != null ? sub.amount : v)}<span>${months === 1 ? '/mês' : '/' + months + ' meses'}</span>`;
    setText('curPayMethod', METHOD_LABEL[sub.payment_method] || sub.payment_method || '—');
    setText('cancelExpiry', fmtDate(sub.expires_at));
  }

  function renderIptvAccess(cred) {
    const card = document.getElementById('iptvAccessCard');
    if (!card) return;
    card.style.display = '';   // sempre visível (permite cadastrar/alterar credenciais)
    const ov = (TVFunDB.credOverride && TVFunDB.credOverride()) || null;
    const eff = ov || cred || {};
    setText('iptvUser', eff.iptv_username || '—');
    setText('iptvPass', eff.iptv_password || '—');
    const tel = (cred && cred.max_connections) || 1;
    setText('iptvScreens', tel + ' tela' + (tel > 1 ? 's' : ''));
    setText('iptvExpiry', (cred && cred.expires_at) ? fmtDate(cred.expires_at) + (cred.is_trial ? ' (teste)' : '') : '—');
    // pré-preenche o formulário de edição
    const cu = document.getElementById('credUser'); if (cu) cu.value = eff.iptv_username || '';
    const cp = document.getElementById('credPass'); if (cp) cp.value = eff.iptv_password || '';
    const copyBtn = document.getElementById('btnCopyM3u');
    if (copyBtn) copyBtn.onclick = async () => {
      const url = (eff.iptv_username && eff.iptv_password)
        ? TVFunDB.buildM3uUrl(eff.iptv_username, eff.iptv_password, eff.panel_host || 'alphapublic.top')
        : ((cred && cred.m3u_url) || '');
      if (!url) { toast('Sem credenciais ainda — preencha abaixo.', true); return; }
      try { await navigator.clipboard.writeText(url); } catch {}
      toast('✓ Link da lista copiado!');
    };
  }

  // ===== ALTERAR CREDENCIAIS DO SERVIDOR (usuário/senha do Alpha) =====
  function setupCredForm() {
    const form = document.getElementById('formCred');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('credUser').value.trim();
      const p = document.getElementById('credPass').value.trim();
      if (!u || !p) { toast('⚠ Informe usuário e senha', true); return; }
      if (typeof TVFunDB === 'undefined' || !TVFunDB.saveCredentials) { toast('⚠ Indisponível agora', true); return; }
      const btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
      const r = await TVFunDB.saveCredentials(u, p);
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar credenciais'; }
      if (r.error) { toast('⚠ ' + r.error, true); return; }
      setText('iptvUser', u); setText('iptvPass', p);
      toast(r.synced ? '✓ Credenciais salvas e sincronizadas!' : '✓ Credenciais salvas! A lista recarrega no app.');
    });
  }

  function renderBilling(subs) {
    const tb = document.getElementById('billingBody');
    if (!tb) return;
    if (!subs || !subs.length) { tb.innerHTML = '<tr><td colspan="4" style="color:var(--gray)">Nenhuma cobrança ainda.</td></tr>'; return; }
    const sBadge = (s) => s === 'active' ? '<span class="badge green">Ativo</span>'
      : s === 'expired' ? '<span class="badge red">Expirado</span>'
      : `<span class="badge">${s}</span>`;
    tb.innerHTML = subs.map(s =>
      `<tr><td>${fmtDate(s.created_at)}</td><td>TV Fun ${s.plan_name || s.plan} · ${s.duration}</td><td>${fmtBRL(s.amount)}</td><td>${sBadge(s.status)}</td></tr>`
    ).join('');
  }

  function renderSession(user) {
    const list = document.getElementById('sessionsList');
    if (!list) return;
    const ua = navigator.userAgent;
    const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Navegador';
    const os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : '';
    const last = user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : 'agora';
    list.innerHTML = `
      <div class="session-item">
        <div class="session-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
        <div class="session-info">
          <p class="session-name">${browser} — ${os} <span class="session-current">Sessão atual</span></p>
          <p class="session-meta">Último acesso: ${last}</p>
        </div>
        <button class="btn-ghost sm" disabled>—</button>
      </div>`;
  }

  function renderDevices(cred) {
    const max = cred?.max_connections || 0;
    const info = document.querySelector('.devices-info');
    if (info) {
      info.innerHTML = `
        <span class="devices-count"><strong>${max || '—'}</strong> tela(s) simultânea(s) no seu plano</span>
        <div class="devices-bar"><div class="devices-bar-fill" style="width:${max ? 100 : 0}%"></div></div>
        <p class="devices-hint">Você pode assistir em até ${max || 0} dispositivo(s) ao mesmo tempo com o seu acesso IPTV.</p>`;
    }
    const list = document.getElementById('devicesList');
    if (!list) return;
    if (!cred || !cred.iptv_username) {
      list.innerHTML = '<div class="empty-list" style="padding:40px"><p>Nenhum acesso IPTV ativo.</p><span>Faça seu teste grátis no app.</span></div>';
      return;
    }
    list.innerHTML = `
      <div class="device-item">
        <div class="device-icon tv"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
        <div class="device-info">
          <p class="device-name">Acesso IPTV — ${cred.iptv_username}</p>
          <p class="device-meta">${max} tela(s) · validade ${cred.expires_at ? fmtDate(cred.expires_at) : '—'} · ${cred.is_trial ? 'teste' : 'assinatura'}</p>
        </div>
        <div class="device-actions"><span class="device-badge">${cred.status === 'active' ? 'Ativo' : (cred.status || '—')}</span></div>
      </div>`;
  }

  async function setupAuth() {
    if (typeof TVFunDB === 'undefined') return;

    const user = await TVFunDB.requireAuth();
    if (!user) return;

    const [profile, sub, cred, subs] = await Promise.all([
      TVFunDB.getProfile(),
      TVFunDB.getActiveSubscription(),
      TVFunDB.getActiveCredentials().catch(() => null),
      TVFunDB.getSubscriptions().catch(() => []),
    ]);

    // Preenche campos do perfil (dados reais)
    const fill = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = el.value || val; };
    const name = profile?.name || user.email.split('@')[0];
    fill('fieldNome', profile?.name);
    fill('fieldDisplay', name.split(' ')[0]);
    fill('fieldEmail', user.email);
    fill('fieldTel', profile?.phone);
    fill('fieldBio', profile?.bio);
    if (profile?.country) { const sel = document.getElementById('fieldPais'); if (sel) sel.value = profile.country; }

    // Sidebar
    document.getElementById('ucName').textContent = name.split(' ')[0];
    document.getElementById('ucEmail').textContent = user.email;
    const av = document.getElementById('ucAvatar');
    if (av) av.textContent = (name || user.email || '?').trim().charAt(0).toUpperCase();
    const sideBadge = document.querySelector('.user-card .plan-badge');
    if (sideBadge) sideBadge.textContent = sub?.plan_name ? `✦ ${sub.plan_name}` : 'Sem plano';

    // Tudo real: plano, acesso IPTV, histórico, sessão e dispositivos
    renderCurrentPlan(sub);
    renderIptvAccess(cred);
    renderBilling(subs);
    renderSession(user);
    renderDevices(cred);

    // Salvar perfil
    document.getElementById('formPerfil')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await TVFunDB.updateProfile({
        name:    document.getElementById('fieldNome').value.trim(),
        phone:   document.getElementById('fieldTel').value.trim(),
        country: document.getElementById('fieldPais').value,
        bio:     document.getElementById('fieldBio').value.trim(),
      });
    });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', () => {
      if (confirm('Deseja sair da sua conta?')) TVFunDB.signOut();
    });
  }

  // ===== INIT =====
  async function init() {
    await setupAuth();
    setupNav();
    loadProfile();
    setupFormPerfil();
    setupAvatar();
    setupFormSenha();
    setup2FA();
    setupSessions();
    setupParental();
    setupPrefs();
    setupLogout();
    setupCancel();
    setupCard();
    setupCredForm();
  }

  document.addEventListener('DOMContentLoaded', () => init().catch(console.error));

  // ===== GLOBAL HELPERS (called from HTML inline) =====
  window.removeSession = function (btn) {
    const item = btn.closest('.session-item');
    item.style.transition = 'opacity .3s, max-height .4s, padding .4s';
    item.style.opacity = '0';
    item.style.maxHeight = '0';
    item.style.overflow = 'hidden';
    item.style.padding = '0';
    setTimeout(() => item.remove(), 400);
    toast('Sessão encerrada.');
  };

  window.removeDevice = function (btn, id) {
    const item = btn.closest('.device-item');
    item.style.transition = 'opacity .3s, max-height .4s, margin .4s';
    item.style.opacity = '0';
    item.style.maxHeight = '0';
    item.style.overflow = 'hidden';
    item.style.marginBottom = '0';
    setTimeout(() => {
      item.remove();
      updateDeviceCount();
    }, 400);
    toast('Dispositivo removido.');
  };

  function updateDeviceCount() {
    const count = document.querySelectorAll('.device-item').length;
    const countEl = document.getElementById('devCount');
    const bar = document.getElementById('devBar');
    if (countEl) countEl.textContent = count;
    if (bar) bar.style.width = ((count / 6) * 100) + '%';
  }

  window.selectPlan = function (btn, planName) {
    const confirmed = confirm(`Mudar para o plano ${planName}?\n\nA mudança será aplicada no próximo ciclo de cobrança.`);
    if (confirmed) toast(`✓ Plano ${planName} selecionado. Mudança no próximo ciclo.`);
  };
})();
