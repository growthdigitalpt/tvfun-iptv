/* ============================================
   TV Fun IPTV — app.js
   ============================================ */

// ── Auth guard (async — executado no init) ───

(function () {
  'use strict';

  // ===== TV / 10-foot UI: detecta Smart TV / set-top box pela user-agent =====
  if (/\b(SmartTV|Smart-TV|TV Safari|GoogleTV|Android TV|AndroidTV|Tizen|Web0S|WebOS|NetCast|HbbTV|BRAVIA|VIERA|AppleTV|AFT[A-Z]|Roku|DTV)\b/i.test(navigator.userAgent)) {
    document.documentElement.classList.add('tv');
  }
  // Enter / Espaço acionam o item focado (cards e linhas de canal) — navegação por controle remoto
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const el = document.activeElement;
    if (el && (el.classList.contains('card') || el.classList.contains('chl-row'))) {
      e.preventDefault();
      el.click();
    }
  });

  // ===== DEMO CHANNELS (used on first load) =====
  const DEMO_M3U = `#EXTM3U x-tvg-url=""
#EXTINF:-1 tvg-id="bbb" tvg-name="Animação HD" tvg-logo="https://picsum.photos/seed/anim/200/200" group-title="Entretenimento",Animação HD
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
#EXTINF:-1 tvg-id="tos" tvg-name="Sci-Fi Canal" tvg-logo="https://picsum.photos/seed/scifi/200/200" group-title="Filmes",Sci-Fi Canal
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4
#EXTINF:-1 tvg-id="ed" tvg-name="Arte & Cinema" tvg-logo="https://picsum.photos/seed/arte/200/200" group-title="Cultura",Arte & Cinema
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4
#EXTINF:-1 tvg-id="fun" tvg-name="Kids TV" tvg-logo="https://picsum.photos/seed/kids/200/200" group-title="Infantil",Kids TV
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4
#EXTINF:-1 tvg-id="blz" tvg-name="Ação Total" tvg-logo="https://picsum.photos/seed/acao/200/200" group-title="Filmes",Ação Total
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4
#EXTINF:-1 tvg-id="esc" tvg-name="Suspense Plus" tvg-logo="https://picsum.photos/seed/susp/200/200" group-title="Filmes",Suspense Plus
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4
#EXTINF:-1 tvg-id="joy" tvg-name="Aventura Canal" tvg-logo="https://picsum.photos/seed/avnt/200/200" group-title="Entretenimento",Aventura Canal
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4
#EXTINF:-1 tvg-id="sub" tvg-name="Discovery Roads" tvg-logo="https://picsum.photos/seed/disc/200/200" group-title="Documentários",Discovery Roads
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4
#EXTINF:-1 tvg-id="gti" tvg-name="Motor Sport TV" tvg-logo="https://picsum.photos/seed/moto/200/200" group-title="Esportes",Motor Sport TV
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4
#EXTINF:-1 tvg-id="bull" tvg-name="Adrenalina HD" tvg-logo="https://picsum.photos/seed/adre/200/200" group-title="Esportes",Adrenalina HD
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4
#EXTINF:-1 tvg-id="cars" tvg-name="Auto Show" tvg-logo="https://picsum.photos/seed/auto/200/200" group-title="Documentários",Auto Show
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4
#EXTINF:-1 tvg-id="mlt" tvg-name="Thriller Zone" tvg-logo="https://picsum.photos/seed/thrl/200/200" group-title="Entretenimento",Thriller Zone
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4`;

  // ===== STORAGE =====
  const KEYS = { channels: 'tvfun_channels', favorites: 'tvfun_favs', recents: 'tvfun_recents', lists: 'tvfun_lists' };

  const store = {
    channels: () => { try { return JSON.parse(localStorage.getItem(KEYS.channels) || 'null'); } catch { return null; } },
    saveChannels: (ch) => localStorage.setItem(KEYS.channels, JSON.stringify(ch)),
    favorites: () => { try { return new Set(JSON.parse(localStorage.getItem(KEYS.favorites) || '[]')); } catch { return new Set(); } },
    saveFavorites: (s) => localStorage.setItem(KEYS.favorites, JSON.stringify([...s])),
    recents: () => { try { return JSON.parse(localStorage.getItem(KEYS.recents) || '[]'); } catch { return []; } },
    saveRecents: (r) => localStorage.setItem(KEYS.recents, JSON.stringify(r)),
    lists: () => { try { return JSON.parse(localStorage.getItem(KEYS.lists) || '[]'); } catch { return []; } },
    saveLists: (l) => localStorage.setItem(KEYS.lists, JSON.stringify(l)),
  };

  // ===== STATE =====
  const state = {
    channels: [],
    groups: [],
    activeGroup: 'all',
    heroMuted: true,
    heroPlayer: null,
    playerInst: null,
    currentChannel: null,
    searchOpen: false,
    hideCtrlTimer: null,
    episodeQueue: null,                         // fila ordenada de episódios da série atual
    episodeIndex: -1,                           // posição do episódio atual na fila
    // Separação por tipo de conteúdo
    listUrl: null,
    activeKind: 'live',                         // live | movie | series
    kindData: { live: null, movie: null, series: null }, // cache: { channels, groups }
    counts: { live: 0, movie: 0, series: 0 },
    // Cache Supabase (preloaded no init)
    favIds: new Set(),
    recentChannels: [],
    savedLists: [],
  };

  const KIND_LABELS = { live: 'Canais', movie: 'Filmes', series: 'Séries' };
  const KIND_BADGE = { live: 'AO VIVO', movie: 'FILME', series: 'SÉRIE' };

  // ===== M3U PARSER =====
  function parseM3U(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const channels = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF')) {
        current = { id: '', name: '', logo: '', group: 'Outros', url: '' };
        // Name: everything after the last comma
        const nameMatch = line.match(/,(.+)$/);
        if (nameMatch) current.name = nameMatch[1].trim();
        // Attributes
        const attr = (key) => { const m = line.match(new RegExp(key + '="([^"]*)"')); return m ? m[1] : ''; };
        current.logo = attr('tvg-logo');
        current.group = attr('group-title') || 'Outros';
        current.id = attr('tvg-id') || current.name;

      } else if (current && !line.startsWith('#')) {
        current.url = line;
        if (current.name) channels.push(current);
        current = null;
      }
    }
    return channels;
  }

  // ===== PLAYER ENGINE (HLS.js + mpegts.js + nativo, via proxy) =====
  const PROXY = '/api/stream?url=';
  const proxied = (url) => PROXY + encodeURIComponent(url);

  // Detecta tipo de stream pela URL
  function streamType(url) {
    if (/\.m3u8(\?|$)/i.test(url)) return 'hls';
    if (/\.mp4(\?|$)/i.test(url)) return 'mp4';
    if (/\.(ts|mpegts)(\?|$)/i.test(url) || /output=mpegts|\/auth\/|\/live\//i.test(url)) return 'mpegts';
    // URLs Xtream sem extensão (…/user/pass/12345) → tratar como mpegts ao vivo
    if (/\/\d+(\?|$)/.test(url)) return 'mpegts';
    return 'mp4';
  }

  // Destrói qualquer player (hls | mpegts) de forma uniforme
  function destroyPlayer(p) {
    if (!p) return null;
    try {
      if (p.engine === 'mpegts' && p.inst) { p.inst.pause?.(); p.inst.unload?.(); p.inst.detachMediaElement?.(); p.inst.destroy?.(); }
      else if (p.engine === 'hls' && p.inst) { p.inst.destroy(); }
    } catch {}
    return null;
  }

  // Carrega um stream no <video>. Retorna { engine, inst } para posterior destruição.
  function loadStream(url, videoEl, onReady, onError) {
    const type = streamType(url);

    // Hints de performance/compatibilidade (essencial no celular: sem playsinline o iOS/Android abre player nativo)
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.playsInline = true;
    videoEl.preload = 'auto';

    // ---- MPEG-TS (canais IPTV ao vivo) via mpegts.js + proxy ----
    if (type === 'mpegts' && typeof mpegts !== 'undefined' && mpegts.getFeatureList().mseLivePlayback) {
      const inst = mpegts.createPlayer(
        { type: 'mpegts', isLive: true, url: proxied(url) },
        {
          enableWorker: false,              // worker quebra playback em alguns navegadores → off (estável)
          enableStashBuffer: true,
          stashInitialSize: 1024,           // cushion de download maior → absorve instabilidade da rede/provedor
          liveBufferLatencyChasing: false,  // NÃO perseguir o "ao vivo": deixa o buffer encher e segurar as travadas
          liveSync: false,                  //   (aceita alguns segundos de atraso — em IPTV é totalmente ok)
          autoCleanupSourceBuffer: true,    // limpa buffer antigo (evita estouro de memória em sessões longas)
          autoCleanupMaxBackwardDuration: 60,
          autoCleanupMinBackwardDuration: 30,
          lazyLoad: false,
          fixAudioTimestampGap: true,       // suaviza gaps de áudio que causam engasgos
          reuseRedirectedURL: true,         // reaproveita a URL pós-redirect (comum em painéis Xtream)
        }
      );
      inst.attachMediaElement(videoEl);
      inst.on(mpegts.Events.ERROR, (type2, detail) => { if (onError) onError({ type: type2, detail }); });
      if (onReady) videoEl.addEventListener('loadeddata', onReady, { once: true });
      inst.load();
      inst.play().catch(() => {});
      return { engine: 'mpegts', inst };
    }

    // ---- HLS (.m3u8) via HLS.js + proxy ----
    if (type === 'hls' && typeof Hls !== 'undefined' && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
      hls.loadSource(proxied(url));
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { videoEl.play().catch(() => {}); if (onReady) onReady(); });
      hls.on(Hls.Events.ERROR, (e, data) => { if (data.fatal && onError) onError(data); });
      return { engine: 'hls', inst: hls };
    }

    // ---- Safari nativo para HLS ----
    if (type === 'hls' && videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = proxied(url);
      videoEl.play().catch(() => {});
      if (onReady) videoEl.addEventListener('loadedmetadata', onReady, { once: true });
      return { engine: 'native', inst: null };
    }

    // ---- MP4 / outros: nativo via proxy (resolve CORS + mixed content) ----
    videoEl.src = proxied(url);
    videoEl.load();
    videoEl.play().catch(() => {});
    if (onReady) videoEl.addEventListener('canplay', onReady, { once: true });
    return { engine: 'native', inst: null };
  }

  // ===== RENDER ====
  function renderAll() {
    const channels = state.channels;
    if (!channels.length) { showEmpty(); return; }

    showChannels();
    renderHero(channels[0]);
    renderRows();
    buildCategoryPills();
  }

  function showEmpty() {
    document.getElementById('heroEmpty').classList.remove('hidden');
    document.getElementById('heroChannel').classList.add('hidden');
    document.getElementById('mainContent').innerHTML = '';
    refreshTrialState();
  }

  // ===== TESTE GRÁTIS (único por usuário) =====
  const N8N_WEBHOOK = 'https://projeto01-n8n.grgyfj.easypanel.host/webhook/tvfun-pagamento';

  function setupTrial() {
    const btn = document.getElementById('btnTrial');
    if (!btn) return;
    btn.dataset.label = btn.innerHTML;
    btn.addEventListener('click', () => {
      if (typeof TVFunDB !== 'undefined') doTrial();
      else loadDemo();   // modo de teste sem login
    });
  }

  // Preenche a "parede de pôsteres" do fundo animado (colunas que derivam)
  function populateAmbWall() {
    const wall = document.getElementById('ambWall');
    if (!wall || wall.childElementCount) return;
    const posters = [
      'https://image.tmdb.org/t/p/w600_and_h900_bestv2/tM5DjBcL6qbzxtZtwgyTqDyHTsX.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/qd3it6YwCa199m7nYwelAqeB1G6.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/cStiqpPNuzvjCzzI8voKhtsxjoL.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/p2wClSPUcs0NidsNBueaTBmGkJd.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/7IOFqkArtYgpftXnviaLD6awQ1U.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/72KQHN1xUO6gWHLRRPyJcCQXlve.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/lGS6aiYtZjh08ci3UAhunoAiBWk.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/wDS6JpTOQglQAF8gWPkPSic5Pit.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/7joKjcNIzDsJszsIlsUUMta17yX.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/eYZUzJMumKoUPX5Q40xBsgFs6dY.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/ns7hOXCSuDtoVUyqx1v806y0XGF.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/2CfaoWBSBUA1wquEa0CF45f4Aaa.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/xsUP5CRd100Rl2cwGcADCBQJ571.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/g7EltLXEau24eZoP9mXCOcZrQDG.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/3PkV4woflbyKEyNGHPjsKftJPvQ.jpg','https://image.tmdb.org/t/p/w600_and_h900_bestv2/tytBUvzKeJgZKuAnBk8Z00TEu6P.jpg',
    ];
    const cols = 6;
    let html = '';
    for (let c = 0; c < cols; c++) {
      const dir = c % 2 === 0 ? 'up' : 'down';
      const colPosters = [];
      for (let i = 0; i < 6; i++) colPosters.push(posters[(c * 3 + i) % posters.length]);
      const imgs = [...colPosters, ...colPosters]
        .map(u => `<img src="${u}" loading="lazy" onerror="this.style.visibility='hidden'">`).join('');
      html += `<div class="amb-col ${dir}" style="animation-delay:-${c * 5}s">${imgs}</div>`;
    }
    wall.innerHTML = html;
  }

  async function refreshTrialState() {
    if (typeof TVFunDB === 'undefined') return;
    try { if (await TVFunDB.hasUsedTrial()) showTrialUsed(); } catch {}
  }

  function showTrialUsed() {
    document.getElementById('btnTrial')?.closest('.hero-empty-btns')?.classList.add('hidden');
    document.querySelector('.trial-note')?.classList.add('hidden');
    document.getElementById('trialUsed')?.classList.remove('hidden');
  }

  async function doTrial() {
    const btn = document.getElementById('btnTrial');
    if (await TVFunDB.hasUsedTrial()) { showTrialUsed(); return; }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span> Gerando seu teste…';
    try {
      const user = await TVFunDB.getUser();
      const res = await fetch(N8N_WEBHOOK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'criar_teste', email: user.email, user_id: user.id }),
      });
      const data = await res.json().catch(() => ({}));

      let m3u = data?.credencial?.m3u_url || null;
      if (!m3u && data?.ok !== false) {
        // a gravação no Supabase pode ter ocorrido — confere lá
        m3u = await TVFunDB.getMyM3uUrl().catch(() => null);
      }
      if (m3u) {
        showToast('✅ Teste liberado! Carregando sua lista…');
        loadM3UFromUrl(m3u);
        setupTrialCountdown();
      } else if (data?.msg) {
        showTrialUsed();
      } else {
        throw new Error('resposta inesperada do provisionamento');
      }
    } catch (e) {
      showToast('⚠ Não consegui gerar o teste agora: ' + e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label;
    }
  }

  // ===== CRONÔMETRO DO TESTE GRÁTIS (persistente: baseado em expires_at) =====
  let _trialTimer = null;
  async function setupTrialCountdown() {
    return; // popup/chip do timer removidos da home — o status do teste/plano fica só na Conta/Planos
    if (typeof TVFunDB === 'undefined') return;
    let cred = null;
    try { cred = await TVFunDB.getActiveCredentials(); } catch {}
    if (!cred || !cred.is_trial || !cred.expires_at) return;
    const expMs = new Date(cred.expires_at).getTime();
    if (isNaN(expMs)) return;
    renderTrialCountdown(expMs);
  }

  function renderTrialCountdown(expMs) {
    let el = document.getElementById('trialTimer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'trialTimer';
      el.className = 'trial-timer';
      el.innerHTML =
        '<button class="tt-min" title="Minimizar" aria-label="Minimizar">–</button>' +
        '<div class="tt-body">' +
          '<div class="tt-icon">⏱️</div>' +
          '<div class="tt-info"><div class="tt-label">Seu teste grátis</div>' +
          '<div class="tt-clock" id="ttClock">--:--</div></div>' +
          '<a class="tt-cta" href="planos.html">Assinar</a>' +
        '</div>';
      document.body.appendChild(el);
      if (localStorage.getItem('tvfun_tt_mini') === '1') el.classList.add('mini');
      el.querySelector('.tt-min').addEventListener('click', () => {
        el.classList.toggle('mini');
        try { localStorage.setItem('tvfun_tt_mini', el.classList.contains('mini') ? '1' : '0'); } catch {}
      });
    }
    const clock = el.querySelector('#ttClock');
    const chip = document.getElementById('navTrialChip');
    const chipClock = document.getElementById('navTrialClock');
    if (chip) chip.hidden = false;            // mostra o chip na barra enquanto o teste corre
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const left = expMs - Date.now();
      if (left <= 0) {
        clearInterval(_trialTimer); _trialTimer = null;
        el.classList.remove('urgent'); el.classList.add('ended');
        el.querySelector('.tt-label').textContent = 'Seu teste acabou';
        clock.textContent = 'Expirado';
        el.querySelector('.tt-cta').textContent = 'Assinar agora';
        if (chip) { chip.classList.remove('urgent'); chip.classList.add('ended'); }
        if (chipClock) chipClock.textContent = 'Expirado';
        return;
      }
      const urgent = left < 30 * 60 * 1000;
      el.classList.toggle('urgent', urgent);
      if (chip) chip.classList.toggle('urgent', urgent);
      const t = Math.floor(left / 1000);
      const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
      const str = h > 0 ? pad(h) + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
      clock.textContent = str;
      if (chipClock) chipClock.textContent = str;
    };
    tick();
    clearInterval(_trialTimer);
    _trialTimer = setInterval(tick, 1000);
  }

  // ===== AVISO DE VENCIMENTO (≤5 dias) — só informativo, sem botão =====
  async function setupExpiryNotice() {
    if (typeof TVFunDB === 'undefined') return;
    const today = new Date().toISOString().slice(0, 10);
    // já fechado hoje? não repete no mesmo dia
    if (localStorage.getItem('tvfun_exp_dismiss') === today) return;
    let sub = null, cred = null;
    try {
      [sub, cred] = await Promise.all([
        TVFunDB.getActiveSubscription().catch(() => null),
        TVFunDB.getActiveCredentials().catch(() => null),
      ]);
    } catch {}
    // menor (mais próxima) data de expiração entre assinatura e credencial IPTV
    const dates = [sub && sub.expires_at, cred && cred.expires_at]
      .map(d => (d ? new Date(d).getTime() : NaN))
      .filter(ms => !isNaN(ms));
    if (!dates.length) return;
    const expMs = Math.min(...dates);
    const daysLeft = Math.ceil((expMs - Date.now()) / 86_400_000);
    if (daysLeft < 0 || daysLeft > 5) return; // só quando está perto (0–5 dias)
    renderExpiryNotice(daysLeft, expMs);
  }

  function renderExpiryNotice(daysLeft, expMs) {
    if (document.getElementById('expNotice')) return;
    const dateStr = new Date(expMs).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const quando = daysLeft <= 0 ? 'hoje' : daysLeft === 1 ? 'amanhã' : `em ${daysLeft} dias`;
    const el = document.createElement('div');
    el.id = 'expNotice';
    el.className = 'exp-notice' + (daysLeft <= 1 ? ' urgent' : '');
    el.innerHTML =
      '<span class="exp-ic">⏳</span>' +
      `<span class="exp-txt">Seu plano vence ${quando} · <b>${dateStr}</b></span>` +
      '<button class="exp-x" aria-label="Fechar aviso">×</button>';
    document.body.appendChild(el);
    el.querySelector('.exp-x').addEventListener('click', () => {
      el.remove();
      try { localStorage.setItem('tvfun_exp_dismiss', new Date().toISOString().slice(0, 10)); } catch {}
    });
  }

  // ===== MODO TV — navegação por controle remoto (D-pad / setas) =====
  // Move o foco para o elemento focável mais próximo na direção apertada; Enter ativa.
  // Só age quando o player está fechado (com o player aberto, as setas controlam o vídeo).
  function setupTvNavigation() {
    const SEL = '.card, .chl-cat, .kind-tab, a[href], button:not([disabled]), [tabindex]';
    const ensureFocusable = (el) => {
      if (!el) return;
      const native = /^(a|button|input|select|textarea)$/i.test(el.tagName) || el.hasAttribute('tabindex');
      if (!native) el.tabIndex = 0;
    };
    const visible = () => Array.from(document.querySelectorAll(SEL)).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    });
    const cen = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const move = (dir) => {
      document.body.classList.add('tv-nav');
      const all = visible();
      if (!all.length) return;
      const cur = document.activeElement;
      if (!cur || cur === document.body || !all.includes(cur)) {
        ensureFocusable(all[0]); all[0].focus(); all[0].scrollIntoView({ block: 'center' }); return;
      }
      const cc = cen(cur.getBoundingClientRect());
      let best = null, score = Infinity;
      for (const el of all) {
        if (el === cur) continue;
        const c = cen(el.getBoundingClientRect());
        const dx = c.x - cc.x, dy = c.y - cc.y;
        let ok, primary, secondary;
        if (dir === 'right') { ok = dx > 6; primary = dx; secondary = Math.abs(dy); }
        else if (dir === 'left') { ok = dx < -6; primary = -dx; secondary = Math.abs(dy); }
        else if (dir === 'down') { ok = dy > 6; primary = dy; secondary = Math.abs(dx); }
        else { ok = dy < -6; primary = -dy; secondary = Math.abs(dx); }
        if (!ok) continue;
        const s = primary + secondary * 2.2; // prioriza alinhamento + proximidade
        if (s < score) { score = s; best = el; }
      }
      if (best) { ensureFocusable(best); best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    };
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      const tag = (t.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || t.isContentEditable) return; // não atrapalhar digitação
      if (document.getElementById('playerModal')?.classList.contains('open')) return; // player usa as setas
      switch (e.key) {
        case 'ArrowRight': move('right'); e.preventDefault(); break;
        case 'ArrowLeft':  move('left');  e.preventDefault(); break;
        case 'ArrowDown':  move('down');  e.preventDefault(); break;
        case 'ArrowUp':    move('up');    e.preventDefault(); break;
        case 'Enter':
          if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.click(); e.preventDefault();
          }
          break;
      }
    });
  }

  function showChannels() {
    document.getElementById('heroEmpty').classList.add('hidden');
    document.getElementById('heroChannel').classList.remove('hidden');
  }

  // ===== HERO =====
  function renderHero(ch) {
    if (!ch) return;
    const video = document.getElementById('heroVideo');
    const kind = ch.kind || 'live';
    const isSeries = kind === 'series';
    state.heroPlayer = destroyPlayer(state.heroPlayer);

    // Só canais ao vivo tocam vídeo de fundo (filmes/séries são VOD pesado, não auto-reproduz)
    const heroMedia = document.querySelector('.hero-media');
    if (kind === 'live') {
      video.muted = true;
      video.style.display = '';
      if (heroMedia) heroMedia.style.backgroundImage = '';
      state.heroPlayer = loadStream(ch.url, video, null, null);
    } else {
      video.pause?.(); video.removeAttribute('src'); video.load?.();
      video.style.display = 'none';
      // Fundo = pôster do título (cover)
      if (heroMedia) {
        heroMedia.style.backgroundImage = ch.logo ? `url('${ch.logo}')` : '';
        heroMedia.style.backgroundSize = 'cover';
        heroMedia.style.backgroundPosition = 'center 20%';
      }
    }

    const heroBadge = kind === 'live' ? `<div class="live-badge"><div class="live-dot"></div>AO VIVO</div>`
      : kind === 'movie' ? `<div class="hero-group">🎬 Filme</div>`
      : `<div class="hero-group">📺 Série · ${ch.episodeCount || ''} episódios</div>`;
    const primaryLabel = isSeries ? 'Ver episódios' : 'Assistir';

    document.getElementById('heroContent').innerHTML = `
      <div class="hero-badge">${KIND_LABELS[kind].toUpperCase()} EM DESTAQUE</div>
      <h1 class="hero-title">${ch.name}</h1>
      <div class="hero-meta">
        ${heroBadge}
        <span class="hero-group">${ch.group}</span>
      </div>
      <div class="hero-actions">
        <button class="btn-play" id="heroBtnPlay">
          <svg viewBox="0 0 24 24" fill="black" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ${primaryLabel}
        </button>
        <button class="btn-info" id="heroBtnFav">
          ${isFav(ch) ? '❤ Favorito' : '♡ Favoritar'}
        </button>
      </div>`;

    document.getElementById('heroBtnPlay').onclick = () => isSeries ? openSeries(ch) : openPlayer(ch);
    document.getElementById('heroBtnFav').onclick = () => { toggleFav(ch); renderHero(ch); renderRows(); };
  }

  // ===== ROWS =====
  function renderRows() {
    if (window.fxPlay) window.fxPlay();
    const wrap = document.getElementById('mainContent');
    wrap.innerHTML = '';

    // Canais ao vivo: lista estilo guia de TV / pay-per-view
    if (state.activeKind === 'live') { renderLiveList(wrap); return; }

    const channels = state.channels;
    const group = state.activeGroup;
    const kind = state.activeKind;

    // Favoritos e Recentes filtrados pelo tipo ativo (mantém a separação canais/filmes/séries)
    const favs = [...state.channels].filter(c => isFav(c));
    const recents = getRecentChannels().filter(r => (r.kind || 'live') === kind);

    // Special rows always shown (if they have content)
    if (group === 'all') {
      const seenSeries = new Set();
      const continuar = [];
      const cands = (state.progressList || []).filter(p => (p.kind || 'movie') === kind)
        .slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));   // mais recentes primeiro
      for (const p of cands) {
        let logo = p.logo;
        if (kind === 'series' && p.name) {
          // capa certa da série (o logo salvo do episódio costuma ser o tvg-logo errado da M3U)
          let best = null;
          for (const c of state.channels) {
            if (c.kind === 'series' && c.name && c.name.length > 3 && p.name.startsWith(c.name) && (!best || c.name.length > best.name.length)) best = c;
          }
          if (best && best.logo) logo = best.logo;
          // 1 item por série: mantém só o episódio mais recente (pula os demais episódios da mesma série)
          const sKey = (best && best.name) || p.name.replace(/\s*[Ss]\d{1,2}\s*[Ee]\d{1,3}.*$/, '').trim() || p.name;
          if (seenSeries.has(sKey)) continue;
          seenSeries.add(sKey);
        }
        continuar.push({ ...p, logo, _resume: true });
      }
      if (continuar.length) buildRow('▶ Continuar assistindo', continuar, wrap, { onClear: clearWatchProgress });
      if (favs.length) buildRow('❤ Favoritos', favs, wrap);
    }
    if (group === 'Favoritos') { buildRow('❤ Favoritos', favs, wrap); return; }

    // Group rows
    const grouped = {};
    channels.forEach(c => {
      if (!grouped[c.group]) grouped[c.group] = [];
      grouped[c.group].push(c);
    });

    const sortedGroups = Object.keys(grouped).sort();
    sortedGroups.forEach(g => {
      if (group !== 'all' && g !== group) return;
      buildRow(g, grouped[g], wrap);
    });
  }

  function buildRow(title, channels, wrap, opts = {}) {
    if (!channels.length) return;
    const row = document.createElement('div');
    row.className = 'row';
    const clearBtn = opts.onClear ? '<button class="row-clear" type="button">🗑 Limpar</button>' : '';
    row.innerHTML = `
      <div class="row-header">
        <h2 class="row-title">${title}</h2>
        <div class="row-header-actions">
          ${clearBtn}
          <button class="row-seeall" type="button">Ver tudo <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>
      </div>
      <div class="row-scroller-wrap">
        <button class="scroll-arrow left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
        <div class="row-scroller"></div>
        <button class="scroll-arrow right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>
      </div>`;

    const scroller = row.querySelector('.row-scroller');

    // Renderização lazy: monta um primeiro lote e o resto sob demanda (scroll horizontal)
    // e a fileira inteira só monta quando entra na viewport (scroll vertical).
    let rendered = 0;
    const BATCH = 16;
    const renderBatch = () => {
      const end = Math.min(rendered + BATCH, channels.length);
      for (; rendered < end; rendered++) scroller.appendChild(buildCard(channels[rendered]));
    };
    const fillToScroll = () => {
      // monta lotes até o scroller ter conteúdo suficiente para rolar
      let guard = 0;
      while (rendered < channels.length && scroller.scrollWidth <= scroller.clientWidth + 400 && guard++ < 60) renderBatch();
    };
    scroller.addEventListener('scroll', () => {
      if (rendered < channels.length && scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 600) renderBatch();
    }, { passive: true });

    row.querySelector('.scroll-arrow.left').onclick = () => scroller.scrollBy({ left: -600, behavior: 'smooth' });
    row.querySelector('.scroll-arrow.right').onclick = () => { renderBatch(); scroller.scrollBy({ left: 600, behavior: 'smooth' }); };
    row.querySelector('.row-seeall').onclick = () => openCategoryGrid(title, channels);
    if (opts.onClear) row.querySelector('.row-clear').onclick = opts.onClear;
    wrap.appendChild(row);

    // só monta os cards quando a fileira chega perto da viewport
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(e => { if (e.isIntersecting) { renderBatch(); fillToScroll(); obs.disconnect(); } });
      }, { rootMargin: '300px' });
      io.observe(row);
    } else { renderBatch(); fillToScroll(); }
  }

  // ===== GRID "VER TUDO" — todos os títulos de uma categoria numa grade =====
  function openCategoryGrid(title, items) {
    if (window.fxPlay) window.fxPlay();
    if (/Continuar|Favoritos/.test(title) || !state.listUrl) { renderCatGrid(title, items); return; }
    const head = document.getElementById('mainContent');
    head.innerHTML = '<div class="cat-grid-head"><button class="cat-grid-back" id="catGridBackL">← Voltar</button><h2 class="cat-grid-title">' + title + '</h2><span class="cat-grid-count">carregando…</span></div>';
    const bk = document.getElementById('catGridBackL'); if (bk) bk.addEventListener('click', renderRows);
    fetch('/api/list?kind=' + state.activeKind + '&url=' + encodeURIComponent(state.listUrl) + '&group=' + encodeURIComponent(title) + '&limit=8000')
      .then(function (r) { return r.json(); })
      .then(function (data) { renderCatGrid(title, (data && data.channels && data.channels.length) ? data.channels : items); })
      .catch(function () { renderCatGrid(title, items); });
  }
  function renderCatGrid(title, items) {
    const wrap = document.getElementById('mainContent');
    wrap.innerHTML =
      '<div class="cat-grid-head">' +
        '<button class="cat-grid-back" id="catGridBack">← Voltar</button>' +
        '<h2 class="cat-grid-title"></h2>' +
        '<span class="cat-grid-count"></span>' +
      '</div>' +
      '<div class="cat-grid" id="catGrid"></div>' +
      '<div id="catGridSentinel" style="height:1px"></div>';
    wrap.querySelector('.cat-grid-title').textContent = title;
    wrap.querySelector('.cat-grid-count').textContent = items.length + ' título' + (items.length !== 1 ? 's' : '');
    const grid = document.getElementById('catGrid');
    let rendered = 0;
    const BATCH = 60;
    const renderBatch = () => {
      const end = Math.min(rendered + BATCH, items.length);
      const frag = document.createDocumentFragment();
      for (; rendered < end; rendered++) frag.appendChild(buildCard(items[rendered]));
      grid.appendChild(frag);
    };
    renderBatch();
    const sentinel = document.getElementById('catGridSentinel');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) { renderBatch(); if (rendered >= items.length) io.disconnect(); }
      }, { rootMargin: '700px' });
      io.observe(sentinel);
    }
    document.getElementById('catGridBack').addEventListener('click', () => renderRows());
    window.scrollTo({ top: 0 });
  }

  // ===== LISTA DE CANAIS (estilo guia de TV / pay-per-view) =====
  // Canais em 2 colunas: categorias (esquerda) | canais da categoria (direita).
  // No celular vira mestre-detalhe: lista de categorias → toca → abre os canais (com voltar).
  function renderLiveList(wrap) {
    const channels = state.channels;
    const favs = channels.filter(c => isFav(c));
    const recents = getRecentChannels().filter(r => (r.kind || 'live') === 'live');

    const grouped = {};
    channels.forEach(c => { (grouped[c.group] = grouped[c.group] || []).push(c); });
    const cats = [];
    if (favs.length) cats.push({ key: 'Favoritos', label: '❤ Favoritos', items: favs });
    Object.keys(grouped).sort().forEach(g => cats.push({ key: g, label: g, items: grouped[g] }));

    if (!cats.length) { wrap.innerHTML = '<div class="empty-list" style="padding:50px;text-align:center;color:var(--gray)">Nenhum canal nesta lista.</div>'; return; }

    wrap.innerHTML =
      '<div class="chl-2col" id="chl2col">' +
        '<div class="chl-cats" id="chlCats"></div>' +
        '<div class="chl-channels" id="chlChannels">' +
          '<button class="chl-back" id="chlBack">‹ Categorias</button>' +
          '<div class="chl-list" id="chlList"></div>' +
        '</div>' +
      '</div>';
    const col = document.getElementById('chl2col');
    const catsEl = document.getElementById('chlCats');
    const listEl = document.getElementById('chlList');
    document.getElementById('chlBack').addEventListener('click', () => { col.classList.remove('show-channels'); window.scrollTo({ top: 0 }); });

    const openCat = (cat, btn) => {
      catsEl.querySelectorAll('.chl-cat').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      const frag = document.createDocumentFragment();
      cat.items.forEach((ch, i) => frag.appendChild(buildChannelRow(ch, i + 1)));
      listEl.innerHTML = '';
      listEl.appendChild(frag);
    };

    const preKey = (state.activeGroup && state.activeGroup !== 'all') ? state.activeGroup : cats[0].key;
    cats.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'chl-cat';
      btn.tabIndex = 0;
      btn.innerHTML = '<span class="chl-cat-name">' + cat.label + '</span><span class="chl-cat-count">' + cat.items.length + '</span>';
      btn.addEventListener('click', () => { openCat(cat, btn); col.classList.add('show-channels'); window.scrollTo({ top: 0 }); });
      catsEl.appendChild(btn);
    });
    // abre a categoria inicial (no desktop as 2 colunas aparecem; no celular fica nas categorias até tocar)
    const startIdx = Math.max(0, cats.findIndex(c => c.key === preKey));
    if (catsEl.children[startIdx]) openCat(cats[startIdx], catsEl.children[startIdx]);
  }

  function buildChannelRow(ch, idx) {
    const fav = isFav(ch);
    const dispName = cleanName(ch.name);
    const hue = nameToColor(ch.name);
    const logoSafe = (ch.logo || '').replace(/'/g, '%27');
    const initial = (dispName || '?')[0].toUpperCase();
    const row = document.createElement('div');
    row.className = 'chl-row';
    row.tabIndex = 0;                  // focável → navegação por controle remoto/teclado (TV)
    row.setAttribute('role', 'button');
    row.innerHTML = `
      <div class="chl-num">${String(idx).padStart(3, '0')}</div>
      <div class="chl-thumb" style="background:linear-gradient(135deg, ${hue}, #0b0b10)">
        ${ch.logo ? `<div class="chl-thumb-blur" style="background-image:url('${logoSafe}')"></div><img src="${ch.logo}" alt="" loading="lazy" onerror="this.style.display='none';this.parentElement.querySelector('.chl-thumb-ini').style.display='flex'">` : ''}
        <span class="chl-thumb-ini" style="${ch.logo ? 'display:none' : 'display:flex'}">${initial}</span>
      </div>
      <div class="chl-info">
        <div class="chl-name">${dispName}</div>
        <div class="chl-group">${ch.group}</div>
      </div>
      <div class="chl-live"><span class="live-dot"></span>AO VIVO</div>
      <button class="chl-fav ${fav ? 'active' : ''}" title="Favoritar"><svg viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
      <button class="chl-play" title="Assistir"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>`;

    row.addEventListener('click', (e) => { if (e.target.closest('.chl-fav')) return; openPlayer(ch); });
    row.querySelector('.chl-play').addEventListener('click', (e) => { e.stopPropagation(); openPlayer(ch); });
    row.querySelector('.chl-fav').addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleFav(ch);
      const b = row.querySelector('.chl-fav'); const nf = isFav(ch);
      b.classList.toggle('active', nf);
      b.querySelector('svg').setAttribute('fill', nf ? 'currentColor' : 'none');
    });
    return row;
  }

  // Fallback de capa: se a imagem falhar, tenta a fonte alternativa (/api/cover → TMDB); senão mostra a inicial.
  window.__coverFb = function (img) {
    const showIni = () => { img.style.display = 'none'; const e = img.parentElement && img.parentElement.querySelector('.card-initial'); if (e) e.style.display = 'flex'; };
    if (img.dataset.fb) return showIni();          // já tentou o fallback → inicial
    const k = img.dataset.kind, n = img.dataset.name;
    if (!k || !n) return showIni();
    img.dataset.fb = '1';
    img.src = '/api/cover?type=' + k + '&title=' + encodeURIComponent(n);
  };

  function buildCard(ch) {
    const fav = isFav(ch);
    const kind = ch.kind || 'live';
    const isSeries = kind === 'series';
    const isLive = kind === 'live';
    // Todos os tipos usam o card pôster (mesmo padrão). Canais: logo centralizado (contain).
    const card = document.createElement('div');
    card.className = 'card poster' + (isLive ? ' live' : '');
    card.dataset.id = ch.id || ch.name;
    card.tabIndex = 0;                 // focável → navegação por controle remoto/teclado (TV)
    card.setAttribute('role', 'button');

    const dispName = cleanName(ch.name);
    const initial = (dispName || '?')[0].toUpperCase();
    const hue = nameToColor(ch.name);
    // Canais ao vivo: fundo escuro com a cor da marca; demais: cor sólida
    const bgColor = isLive ? `linear-gradient(155deg, ${hue}, #0b0b10 75%)` : hue;
    const imgClass = isLive ? 'poster-img logo-contain' : 'poster-img';
    const logoSafe = (ch.logo || '').replace(/'/g, '%27');

    // Badge por tipo
    let badge = '';
    if (isLive) badge = `<div class="live-badge"><div class="live-dot"></div>AO VIVO</div>`;
    else if (isSeries) badge = `<div class="poster-badge">${ch.episodeCount || ''} EP</div>`;

    const playIcon = isSeries
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="#111"><polygon points="5 3 19 12 5 21 5 3"/></svg>';

    const cname = (dispName || ch.name || '').replace(/"/g, '&quot;');
    const fbData = isLive ? '' : ` data-kind="${kind}" data-name="${cname}"`;
    const posterImg = ch.logo
      ? `<img class="${imgClass}" src="${ch.logo}" alt="${cname}" loading="lazy"${fbData} onerror="window.__coverFb(this)">`
      : (isLive ? '' : `<img class="${imgClass}" src="/api/cover?type=${kind}&title=${encodeURIComponent(dispName || ch.name || '')}" alt="${cname}" loading="lazy" data-fb="1" onerror="window.__coverFb(this)">`);
    const initialStyle = (ch.logo || !isLive) ? 'display:none' : '';
    card.innerHTML = `
      <div class="card-img" style="background:${bgColor}">
        ${isLive && ch.logo ? `<div class="card-bg-blur" style="background-image:url('${logoSafe}')"></div><div class="card-bg-shade"></div>` : ''}
        ${posterImg}
        <div class="card-initial" style="${initialStyle}">${initial}</div>
        ${badge}
        <div class="poster-hover">
          <button class="poster-play">${playIcon}</button>
          <button class="poster-fav ${fav ? 'fav-active' : ''}"><svg viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
        </div>
      </div>
      <div class="poster-name">${dispName}</div>`;

    // Clique: filme → página de detalhes; série → detalhes/episódios; canal → player
    const open = (e) => {
      e.stopPropagation();
      if (ch._resume) return openPlayer(ch, (ch.duration && ch.position >= ch.duration * 0.95) ? 0 : (ch.position || 0)); // resume; concluído → do início
      if (isSeries) return ch.url ? askResume(ch) : openSeries(ch);   // episódio (tem URL) → pergunta; série (sem URL) abre lista
      return kind === 'movie' ? openMovieDetail(ch) : openPlayer(ch);
    };
    card.querySelector('.card-img').addEventListener('click', open);
    card.querySelector('.poster-play').addEventListener('click', open);

    const favBtn = card.querySelector('.poster-fav');
    favBtn.addEventListener('click', async e => {
      e.stopPropagation();
      await toggleFav(ch);
      const nowFav = isFav(ch);
      favBtn.classList.toggle('fav-active', nowFav);
      favBtn.querySelector('svg').setAttribute('fill', nowFav ? 'currentColor' : 'none');
    });

    return card;
  }

  // extrai o id Xtream (número antes da extensão) da URL
  function vodIdFromUrl(url) { const m = (url || '').match(/\/(\d+)\.\w+(\?|$)/); return m ? m[1] : null; }

  // ===== FILME → PÁGINA DE DETALHES =====
  async function openMovieDetail(item) {
    const modal = document.getElementById('seriesModal');
    const content = document.getElementById('seriesContent');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    content.innerHTML = '<div class="series-loading">Carregando…</div>';

    let info = {};
    try {
      const id = vodIdFromUrl(item.url);
      if (id) {
        const res = await fetch('/api/info?type=movie&id=' + id + '&listUrl=' + encodeURIComponent(state.listUrl));
        if (res.ok) info = await res.json();
      }
    } catch {}

    const poster = info.cover || item.logo || '';
    const backdrop = info.backdrop || poster;
    const initial = (item.name || '?')[0].toUpperCase();
    const meta = [info.releaseDate ? info.releaseDate.slice(0, 4) : '', info.duration ? info.duration + ' min' : '', info.genre || item.group].filter(Boolean);

    content.innerHTML = `
      <div class="detail-backdrop" style="${backdrop ? `background-image:url('${backdrop}')` : ''}">
        <div class="detail-backdrop-fade"></div>
      </div>
      <div class="detail-body">
        <div class="detail-top">
          <div class="detail-poster">${poster ? `<img src="${poster}" onerror="this.parentElement.textContent='${initial}'">` : initial}</div>
          <div class="detail-head">
            <h2 class="detail-title">${info.name || item.name}</h2>
            <div class="detail-meta">
              <span class="detail-tag">🎬 Filme</span>
              ${meta.map(m => `<span>${m}</span>`).join('<span class="detail-dot">·</span>')}
            </div>
            <div class="detail-actions">
              <button class="btn-play" id="detailPlay">
                <svg viewBox="0 0 24 24" fill="black" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg> Assistir
              </button>
              <button class="btn-info" id="detailFav">${isFav(item) ? '❤ Na lista' : '♡ Minha Lista'}</button>
            </div>
          </div>
        </div>
        ${info.plot ? `<p class="detail-plot">${info.plot}</p>` : '<p class="detail-plot" style="color:var(--gray)">Sinopse não disponível.</p>'}
        ${info.cast ? `<div class="detail-credits"><strong>Elenco:</strong> ${info.cast}</div>` : ''}
        ${info.director ? `<div class="detail-credits"><strong>Direção:</strong> ${info.director}</div>` : ''}
      </div>`;

    document.getElementById('detailPlay').addEventListener('click', async () => {
      closeSeries();
      const m = { name: info.name || item.name, url: item.url, group: item.group, logo: poster, kind: 'movie', id: item.url };
      openPlayer(m, await getResumePos(m.id));   // filme continua direto de onde parou
    });
    // Rótulo: se há progresso, mostra "Continuar assistindo"
    getResumePos(item.url).then(pos => { if (pos > 0) { const b = document.getElementById('detailPlay'); if (b) b.innerHTML = b.innerHTML.replace('Assistir', 'Continuar · ' + formatTime(pos)); } });
    document.getElementById('detailFav').addEventListener('click', async (e) => {
      await toggleFav(item);
      e.target.textContent = isFav(item) ? '❤ Na lista' : '♡ Minha Lista';
    });
  }

  // ===== SÉRIE → PÁGINA DE DETALHES + EPISÓDIOS =====
  async function openSeries(item) {
    const modal = document.getElementById('seriesModal');
    const content = document.getElementById('seriesContent');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    content.innerHTML = '<div class="series-loading">Carregando episódios…</div>';

    try {
      const [epRes, info] = await Promise.all([
        fetch('/api/episodes?url=' + encodeURIComponent(state.listUrl) +
          '&series=' + encodeURIComponent(item.series || item.name) + '&group=' + encodeURIComponent(item.group || '')),
        fetch('/api/info?type=series&series=' + encodeURIComponent(item.series || item.name) + '&listUrl=' + encodeURIComponent(state.listUrl))
          .then(r => r.ok ? r.json() : {}).catch(() => ({})),
      ]);
      if (!epRes.ok) throw new Error('Não foi possível carregar os episódios.');
      const data = await epRes.json();
      renderSeries(item, data, info);
    } catch (err) {
      content.innerHTML = '<div class="series-loading">⚠ ' + err.message + '</div>';
    }
  }

  function renderSeries(item, data, info = {}) {
    const content = document.getElementById('seriesContent');
    const seasons = Object.keys(data.seasons).map(Number).sort((a, b) => a - b);
    const initial = (item.name || '?')[0].toUpperCase();
    const poster = info.cover || item.logo || data.logo || '';
    const backdrop = poster;

    // Episódio em andamento desta série → botão "Continuar assistindo" no topo
    const epUrls = new Set();
    Object.values(data.seasons).forEach(eps => eps.forEach(ep => ep.url && epUrls.add(ep.url)));
    const seriesProg = (state.progressList || []).concat(localProgressList()).find(p => epUrls.has(p.url));
    const continueBtn = seriesProg
      ? `<button class="btn-continue" id="seriesContinue"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg> Continuar assistindo · ${formatTime(seriesProg.position)}</button>`
      : '';

    content.innerHTML = `
      <div class="detail-backdrop" style="${backdrop ? `background-image:url('${backdrop}')` : ''}">
        <div class="detail-backdrop-fade"></div>
      </div>
      <div class="detail-body">
        <div class="detail-top">
          <div class="detail-poster">${poster ? `<img src="${poster}" onerror="this.parentElement.textContent='${initial}'">` : initial}</div>
          <div class="detail-head">
            <h2 class="detail-title">${data.series}</h2>
            <div class="detail-meta">
              <span class="detail-tag">📺 Série</span>
              <span>${item.group || data.group}</span>
              <span class="detail-dot">·</span>
              <span>${seasons.length} temporada${seasons.length !== 1 ? 's' : ''} · ${data.total} episódios</span>
            </div>
            ${continueBtn}
          </div>
        </div>
        ${info.plot ? `<p class="detail-plot">${info.plot}</p>` : ''}
        ${info.cast ? `<div class="detail-credits"><strong>Elenco:</strong> ${info.cast}</div>` : ''}
      </div>
      <div class="season-bar" id="seasonBar"></div>
      <div class="episode-list" id="episodeList"></div>`;

    if (seriesProg) document.getElementById('seriesContinue').addEventListener('click', () => {
      closeSeries();
      state.episodeQueue = buildEpisodeQueue(data);
      state.episodeIndex = state.episodeQueue.findIndex(e => e.url === seriesProg.url);
      openPlayer({ name: seriesProg.name, url: seriesProg.url, group: seriesProg.group || item.group, logo: seriesProg.logo, kind: 'series', id: seriesProg.id }, seriesProg.position);
    });

    const seasonBar = content.querySelector('#seasonBar');
    seasons.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = 'season-btn' + (i === 0 ? ' active' : '');
      btn.textContent = s === 0 ? 'Episódios' : 'Temporada ' + s;
      btn.addEventListener('click', () => {
        seasonBar.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderEpisodes(data.seasons[s], data);
      });
      seasonBar.appendChild(btn);
    });
    renderEpisodes(data.seasons[seasons[0]], data);
  }

  function renderEpisodes(eps, data) {
    const list = document.getElementById('episodeList');
    list.innerHTML = '';
    eps.forEach(ep => {
      const row = document.createElement('div');
      row.className = 'episode-item';
      const epLabel = ep.episode ? 'E' + String(ep.episode).padStart(2, '0') : '▶';
      row.innerHTML = `
        <div class="episode-num">${epLabel}</div>
        <div class="episode-info">
          <div class="episode-name">${ep.name}</div>
          <div class="episode-sub">${ep.season ? 'Temporada ' + ep.season : data.series}</div>
        </div>
        <div class="episode-play"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`;
      row.addEventListener('click', () => {
        closeSeries();
        state.episodeQueue = buildEpisodeQueue(data);
        state.episodeIndex = state.episodeQueue.findIndex(e => e.url === ep.url);
        askResume(epToChannel(ep, data));
      });
      list.appendChild(row);
    });
  }

  // ===== FILA DE EPISÓDIOS (próximo episódio + autoplay até acabar) =====
  function epToChannel(ep, data) {
    return { name: ep.name, url: ep.url, group: data.group, logo: ep.logo || data.logo, kind: 'series', id: ep.url };
  }
  function buildEpisodeQueue(data) {
    const seasons = Object.keys(data.seasons).map(Number).sort((a, b) => a - b);
    const q = [];
    seasons.forEach(s => (data.seasons[s] || []).forEach(ep => { if (ep.url) q.push(epToChannel(ep, data)); }));
    return q;
  }
  function playNextEpisode() {
    if (!state.episodeQueue || state.episodeIndex < 0) return false;
    const next = state.episodeQueue[state.episodeIndex + 1];
    if (!next) return false;
    // marca o episódio atual como concluído (sai do "continuar assistindo")
    const v = document.getElementById('videoEl');
    if (state.currentChannel && v && v.duration) saveProgressBoth(state.currentChannel, v.duration, v.duration);
    openPlayer(next, 0);   // o próximo episódio sempre começa do início
    return true;
  }

  // Monta a fila on-demand quando o episódio é tocado FORA da página da série
  // (ex.: "Continuar assistindo" da home, recentes) — busca os episódios da série.
  async function ensureEpisodeQueue(ch) {
    try {
      if (!ch || ch.kind !== 'series' || !ch.url || !state.listUrl) return;
      if (state.episodeQueue && state.episodeQueue.some(e => e.url === ch.url)) return;
      // o servidor acha a série pela URL do episódio (robusto — sem adivinhar o nome)
      const er = await fetch('/api/episodes?url=' + encodeURIComponent(state.listUrl) + '&epurl=' + encodeURIComponent(ch.url)).then(r => r.json());
      const seasons = er && er.seasons;
      if (!seasons) return;
      const q = [];
      Object.keys(seasons).map(Number).sort((a, b) => a - b)
        .forEach(s => (seasons[s] || []).forEach(ep => { if (ep.url) q.push({ name: ep.name, url: ep.url, group: ch.group, logo: ep.logo || ch.logo, kind: 'series', id: ep.url }); }));
      const idx = q.findIndex(e => e.url === ch.url);
      if (idx >= 0) { state.episodeQueue = q; state.episodeIndex = idx; }
    } catch {}
  }

  function closeSeries() {
    document.getElementById('seriesModal').classList.remove('open');
    if (!document.getElementById('playerModal').classList.contains('open')) document.body.style.overflow = '';
  }

  function nameToColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 30%, 16%)`;
  }

  // Corrige nomes malformados (quando atributos do m3u vazam pro nome)
  function cleanName(n) {
    if (!n) return n || '';
    if (/group-title=|tvg-(id|name|logo)=/i.test(n)) {
      const m = n.match(/,\s*([^,]+)\s*$/);
      if (m) return m[1].trim();
    }
    return n;
  }

  function formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
    const mm = String(m).padStart(h ? 2 : 1, '0'), sss = String(ss).padStart(2, '0');
    return h ? `${h}:${mm}:${sss}` : `${mm}:${sss}`;
  }

  // ===== FAVORITES (cache in state.favIds) =====
  function isFav(ch) { return state.favIds.has(String(ch.id || ch.name)); }

  async function toggleFav(ch) {
    const key = String(ch.id || ch.name);
    if (typeof TVFunDB !== 'undefined') {
      const added = await TVFunDB.toggleFavorite(ch);
      if (added) { state.favIds.add(key); showToast(`❤ ${ch.name} adicionado aos favoritos`); }
      else { state.favIds.delete(key); showToast(`Removido dos favoritos`); }
    } else {
      // fallback localStorage
      const favs = store.favorites();
      if (favs.has(key)) { favs.delete(key); showToast(`Removido dos favoritos`); }
      else { favs.add(key); showToast(`❤ ${ch.name} adicionado aos favoritos`); }
      store.saveFavorites(favs);
      state.favIds = favs;
    }
  }

  // ===== RECENTS (cache in state.recentChannels) =====
  async function addRecent(ch) {
    state.recentChannels = [ch, ...state.recentChannels.filter(r => r.id !== ch.id)].slice(0, 12);
    if (typeof TVFunDB !== 'undefined') {
      TVFunDB.addToHistory(ch).catch(() => {}); // async, não bloqueia
    } else {
      store.saveRecents(state.recentChannels);
    }
  }
  function getRecentChannels() { return state.recentChannels; }

  // ===== PROGRESSO — localStorage (instantâneo, sem SQL) + Supabase (entre dispositivos) =====
  const PROG_KEY = 'tvfun_progress';
  function localProgressMap() { try { return JSON.parse(localStorage.getItem(PROG_KEY) || '{}'); } catch { return {}; } }
  function saveLocalProgress(ch, pos, dur) {
    if (!ch) return;
    const m = localProgressMap();
    const cid = String(ch.id || ch.name);
    m[cid] = { id: cid, name: ch.name || '', logo: ch.logo || '', group: ch.group || '', url: ch.url || '', kind: ch.kind || 'movie', position: Math.floor(pos || 0), duration: Math.floor(dur || 0), updated: Date.now() };
    try { localStorage.setItem(PROG_KEY, JSON.stringify(m)); } catch {}
  }
  const _validProg = (e) => e && e.position > 30 && (!e.duration || e.position < e.duration * 0.95);  // p/ RESUME (só no meio)
  const _recentProg = (e) => e && e.position > 60;  // p/ a LISTA "continuar/assistidos" (inclui concluídos, vira histórico)
  function localProgress(cid) { const e = localProgressMap()[String(cid)]; return _validProg(e) ? e.position : 0; }
  function localProgressList() { return Object.values(localProgressMap()).filter(_recentProg).sort((a, b) => b.updated - a.updated); }
  function mergeProgress(local, supa) {
    const seen = new Set(); const out = [];
    for (const x of [...(local || []), ...(supa || [])]) { const k = String(x.id); if (k && !seen.has(k)) { seen.add(k); out.push(x); } }
    return out.slice(0, 12);
  }
  // Salva o progresso nos dois lugares
  function saveProgressBoth(ch, pos, dur) {
    saveLocalProgress(ch, pos, dur);
    if (typeof TVFunDB !== 'undefined' && TVFunDB.saveProgress) TVFunDB.saveProgress(ch, pos, dur).catch(() => {});
  }
  // Limpa TODO o "Continuar assistindo" (local + nuvem) — botão 🗑 Limpar
  async function clearWatchProgress() {
    if (!confirm('Limpar tudo do "Continuar assistindo"?\n\nIsso apaga o histórico de onde você parou (em todos os aparelhos).')) return;
    try { localStorage.removeItem(PROG_KEY); } catch {}
    if (typeof TVFunDB !== 'undefined' && TVFunDB.clearProgress) { try { await TVFunDB.clearProgress(); } catch {} }
    state.progressList = [];
    renderRows();
    showToast('✓ "Continuar assistindo" limpo');
  }
  // Posição salva (local primeiro; senão Supabase). 0 = sem progresso.
  async function getResumePos(cid) {
    const lp = localProgress(cid);
    if (lp) return lp;
    try {
      if (typeof TVFunDB !== 'undefined' && TVFunDB.getProgress) {
        const p = await TVFunDB.getProgress(cid);
        if (p && p.position_seconds > 30 && (!p.duration_seconds || p.position_seconds < p.duration_seconds * 0.95)) return p.position_seconds;
      }
    } catch {}
    return 0;
  }

  // Pergunta "continuar de onde parou" vs "do início" (VOD com progresso); senão toca do início.
  async function askResume(ch) {
    const pos = await getResumePos(ch.id || ch.name);
    if (pos > 0) showResumeDialog(ch, pos);
    else openPlayer(ch, 0);
  }

  function showResumeDialog(ch, pos) {
    const old = document.getElementById('resumeDialog'); if (old) old.remove();
    const d = document.createElement('div');
    d.id = 'resumeDialog';
    d.className = 'resume-bg';
    d.innerHTML =
      '<div class="resume-box">' +
        '<div class="resume-title">' + (ch.name || 'Continuar assistindo?') + '</div>' +
        '<div class="resume-sub">Você parou em ' + formatTime(pos) + '.</div>' +
        '<button class="resume-btn primary" id="rdGo">▶ Continuar de ' + formatTime(pos) + '</button>' +
        '<button class="resume-btn" id="rdStart">↺ Assistir do início</button>' +
      '</div>';
    document.body.appendChild(d);
    const close = () => d.remove();
    d.addEventListener('click', e => { if (e.target === d) close(); });
    document.getElementById('rdGo').onclick = () => { close(); openPlayer(ch, pos); };
    document.getElementById('rdStart').onclick = () => { close(); openPlayer(ch, 0); };
  }

  // ===== PLAYER =====
  // resumeAt: segundos onde começar (0 = do início). A escolha "continuar/do início" vem de askResume().
  function openPlayer(ch, resumeAt = 0) {
    state.currentChannel = ch;
    addRecent(ch);

    // Fila de episódios: mantém só se este conteúdo pertence a ela; senão zera (filme/canal/outra série)
    if (ch && ch.kind === 'series' && state.episodeQueue && state.episodeQueue.some(e => e.url === ch.url)) {
      state.episodeIndex = state.episodeQueue.findIndex(e => e.url === ch.url);
    } else {
      state.episodeQueue = null; state.episodeIndex = -1;
      if (ch && ch.kind === 'series' && ch.url) ensureEpisodeQueue(ch);   // monta on-demand (home/recentes)
    }

    const modal = document.getElementById('playerModal');
    const videoEl = document.getElementById('videoEl');
    const isVOD = (ch.kind === 'movie' || ch.kind === 'series') || /\/(movie|series)\//i.test(ch.url || '');

    document.getElementById('playerChName').textContent = ch.name;
    document.getElementById('playerChGroup').textContent = ch.group || '';

    // Live (AO VIVO) vs VOD (filme/série com barra de progresso)
    const wrap = document.getElementById('playerWrap');
    wrap.classList.toggle('live', !isVOD);   // live: esconde play/seek; VOD: controles completos
    const topBar = document.getElementById('playerTopBar');
    const liveTag = document.querySelector('.live-tag');
    topBar.classList.toggle('vod', isVOD);
    if (liveTag) liveTag.classList.toggle('vod-hidden', isVOD);
    document.getElementById('pTime').textContent = isVOD ? '0:00 / 0:00' : 'AO VIVO';
    document.getElementById('pTime').style.color = isVOD ? '' : 'var(--live)';
    state.currentIsVOD = isVOD;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('playerLoading').classList.add('active');

    state.reconnectAttempts = 0;
    state._lastSave = 0;
    startPlayback(ch, isVOD);

    // Retoma na posição escolhida (resumeAt > 0); senão começa do início.
    if (isVOD && resumeAt > 0) {
      const v = document.getElementById('videoEl');
      const seek = () => { if (v.duration && resumeAt < v.duration - 5) v.currentTime = resumeAt; };
      v.readyState >= 1 && v.duration ? seek() : v.addEventListener('loadedmetadata', seek, { once: true });
    }

    updateFavBtn();
    resetHideCtrl();
    if (!isVOD) startStallWatchdog();  // anti-travamento só para canais ao vivo
  }

  // Carrega/recarrega o stream no player (usado no play inicial e na reconexão)
  function startPlayback(ch, isVOD) {
    const videoEl = document.getElementById('videoEl');
    state.playerInst = destroyPlayer(state.playerInst);
    videoEl.src = '';
    document.getElementById('playerLoading').classList.add('active');

    state.playerInst = loadStream(
      ch.url, videoEl,
      () => document.getElementById('playerLoading').classList.remove('active'),
      (err) => {
        document.getElementById('playerLoading').classList.remove('active');
        // Erro de rede em canal ao vivo → tenta reconectar automaticamente
        if (!isVOD && err && /NetworkError|network/i.test(err.type || '')) {
          reconnectPlayer('erro de rede');
        } else {
          showToast('⚠ Erro ao carregar ' + (isVOD ? 'o conteúdo' : 'o canal'));
        }
      }
    );
  }

  // Reconecta o canal ao vivo (recupera de travamento/queda)
  function reconnectPlayer(motivo) {
    const ch = state.currentChannel;
    if (!ch || !document.getElementById('playerModal').classList.contains('open')) return;
    if (state.reconnectAttempts >= 5) { showToast('⚠ Canal instável. Tente outro.'); return; }
    state.reconnectAttempts++;
    showToast(`🔄 Reconectando… (${motivo})`);
    startPlayback(ch, false);
  }

  // Recuperação leve: pula para a borda do buffer (resolve a maioria das travadas sem reconectar)
  function nudgeToBufferEdge(videoEl) {
    try {
      const b = videoEl.buffered;
      if (b && b.length) {
        const end = b.end(b.length - 1);
        if (end - videoEl.currentTime > 0.4) { videoEl.currentTime = end - 0.3; videoEl.play().catch(() => {}); return true; }
      }
    } catch {}
    return false;
  }

  // Watchdog anti-travamento (canais ao vivo): recupera em 2 níveis antes de reconectar.
  function startStallWatchdog() {
    clearInterval(state.stallTimer);
    const videoEl = document.getElementById('videoEl');
    let lastTime = -1, stalledFor = 0;
    state.stallTimer = setInterval(() => {
      if (!document.getElementById('playerModal').classList.contains('open')) { clearInterval(state.stallTimer); return; }
      if (videoEl.paused || videoEl.readyState < 2) { stalledFor = 0; lastTime = videoEl.currentTime; return; }
      if (Math.abs(videoEl.currentTime - lastTime) < 0.04) {
        stalledFor += 1;
        if (stalledFor === 3) nudgeToBufferEdge(videoEl);          // nível 1 (~3s): pula p/ a borda do buffer (instantâneo)
        else if (stalledFor >= 8) { stalledFor = 0; reconnectPlayer('travou'); }  // nível 2 (~8s): reconecta
      } else {
        stalledFor = 0;
        state.reconnectAttempts = 0; // voltou a tocar → zera tentativas
      }
      lastTime = videoEl.currentTime;
    }, 1000);
  }

  function closePlayer() {
    const videoEl = document.getElementById('videoEl');
    // salva a posição final (continuar assistindo entre dispositivos)
    if (state.currentIsVOD && state.currentChannel && videoEl.currentTime > 30) {
      saveProgressBoth(state.currentChannel, videoEl.currentTime, videoEl.duration);
    }
    videoEl.pause(); videoEl.src = '';
    state.playerInst = destroyPlayer(state.playerInst);
    clearTimeout(state.hideCtrlTimer);
    clearInterval(state.stallTimer);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    document.getElementById('playerWrap')?.classList.remove('ios-fs');   // sai da paisagem forçada (iPhone)
    document.documentElement.classList.remove('ios-fs-on');
    document.getElementById('btnNextEp')?.setAttribute('hidden', '');    // esconde "próximo episódio"
    state.episodeQueue = null; state.episodeIndex = -1;
    document.getElementById('playerModal').classList.remove('open');
    document.body.style.overflow = '';
    state.currentChannel = null;
    state.progressList = mergeProgress(localProgressList(), state.progressList); // atualiza "Continuar assistindo"
    renderRows(); // refresh recents + continuar
  }

  function updateFavBtn() {
    const ch = state.currentChannel;
    if (!ch) return;
    const fav = isFav(ch);
    const btn = document.getElementById('btnFavPlayer');
    btn.classList.toggle('active', fav);
  }

  function resetHideCtrl() {
    const wrap = document.getElementById('playerWrap');
    if (!wrap) return;
    wrap.classList.add('ctrl-on');
    clearTimeout(state.hideCtrlTimer);
    state.hideCtrlTimer = setTimeout(() => {
      if (!document.getElementById('videoEl').paused) wrap.classList.remove('ctrl-on');  // some sozinho só se estiver tocando
    }, 3000);
  }
  function hideControls() {
    document.getElementById('playerWrap').classList.remove('ctrl-on');
    clearTimeout(state.hideCtrlTimer);
  }

  function setupPlayerControls() {
    const video = document.getElementById('videoEl');
    const track = document.querySelector('.p-track');
    const played = document.getElementById('pPlayed');
    const buf = document.getElementById('pBuf');
    const thumb = document.getElementById('pThumb');
    const btnPlay = document.getElementById('btnPlay');
    const iconPlay = document.getElementById('iconPlay');

    // ── Botão "Próximo episódio" (canto inferior direito) + autoplay ao terminar ──
    const playerWrap = document.getElementById('playerWrap');
    let nextEpBtn = document.getElementById('btnNextEp');
    if (!nextEpBtn) {
      nextEpBtn = document.createElement('button');
      nextEpBtn.id = 'btnNextEp';
      nextEpBtn.className = 'next-ep-btn';
      nextEpBtn.hidden = true;
      nextEpBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5 4 15 12 5 20"/><rect x="16" y="4" width="2.4" height="16" rx="1"/></svg><span>Próximo episódio</span>';
      nextEpBtn.addEventListener('click', (e) => { e.stopPropagation(); playNextEpisode(); });
      playerWrap.appendChild(nextEpBtn);
    }
    const hasNextEp = () => !!(state.episodeQueue && state.episodeIndex >= 0 && state.episodeIndex < state.episodeQueue.length - 1);
    const updateNextEpBtn = () => {
      const rem = video.duration - video.currentTime;
      nextEpBtn.hidden = !(state.currentIsVOD && hasNextEp() && isFinite(rem) && rem > 0 && rem <= 60);
    };
    // Autoplay: quando o episódio termina, toca o próximo — sempre, até não ter mais
    video.addEventListener('ended', () => {
      if (hasNextEp()) { nextEpBtn.hidden = true; playNextEpisode(); return; }
      // último episódio (ou filme): marca como concluído
      if (state.currentIsVOD && state.currentChannel && video.duration) {
        saveProgressBoth(state.currentChannel, video.duration, video.duration);
      }
    });

    video.addEventListener('timeupdate', () => {
      if (!video.duration || !isFinite(video.duration)) return;
      const pct = (video.currentTime / video.duration) * 100;
      played.style.width = pct + '%';
      thumb.style.left = pct + '%';
      if (video.buffered.length) {
        buf.style.width = (video.buffered.end(video.buffered.length - 1) / video.duration * 100) + '%';
      }
      // VOD mostra tempo decorrido / total + salva progresso a cada ~10s (continuar assistindo)
      if (state.currentIsVOD) {
        document.getElementById('pTime').textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
        if (video.currentTime - (state._lastSave || 0) > 10) {
          state._lastSave = video.currentTime;
          const ch = state.currentChannel;
          if (ch) saveProgressBoth(ch, video.currentTime, video.duration);
        }
      }
      updateNextEpBtn();
    });
    video.addEventListener('play', () => { iconPlay.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'; });
    video.addEventListener('pause', () => { iconPlay.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>'; });
    video.addEventListener('waiting', () => document.getElementById('playerLoading').classList.add('active'));
    video.addEventListener('playing', () => document.getElementById('playerLoading').classList.remove('active'));

    let seeking = false;
    const doSeek = (e) => {
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
      if (video.duration && isFinite(video.duration)) video.currentTime = pct * video.duration;
      resetHideCtrl();
    };
    // Pointer Events = funciona com mouse E toque (iPhone/Android): tocar/arrastar na barra pra escolher o minuto
    track.addEventListener('pointerdown', e => { seeking = true; try { track.setPointerCapture(e.pointerId); } catch {} doSeek(e); });
    track.addEventListener('pointermove', e => { if (seeking) doSeek(e); });
    track.addEventListener('pointerup', () => { seeking = false; });
    track.addEventListener('pointercancel', () => { seeking = false; });

    // Tooltip de tempo ao passar o mouse na barra (escolher o minuto) — só VOD
    const seekTip = document.getElementById('pSeekTip');
    track.addEventListener('mousemove', e => {
      if (!state.currentIsVOD || !video.duration || !isFinite(video.duration)) { if (seekTip) seekTip.style.opacity = '0'; return; }
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
      if (seekTip) {
        seekTip.textContent = formatTime(pct * video.duration);
        seekTip.style.left = (pct * 100) + '%';
        seekTip.style.opacity = '1';
      }
    });
    track.addEventListener('mouseleave', () => { if (seekTip) seekTip.style.opacity = '0'; });

    const wrap = document.getElementById('playerWrap');
    const centerBtn = document.getElementById('playerCenterBtn');
    const iconCenter = document.getElementById('iconCenter');
    const togglePlay = () => { video.paused ? video.play() : video.pause(); };
    const syncCenterIcon = () => {
      iconCenter.innerHTML = video.paused
        ? '<polygon points="5 3 19 12 5 21 5 3"/>'
        : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    };
    video.addEventListener('play', syncCenterIcon);
    video.addEventListener('pause', syncCenterIcon);

    btnPlay.addEventListener('click', togglePlay);
    centerBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); resetHideCtrl(); });

    // Toque/clique na área do vídeo
    video.addEventListener('click', () => {
      if (matchMedia('(pointer: coarse)').matches) {
        // celular: 1º toque só mostra os controles; tocar de novo esconde (não pausa)
        wrap.classList.contains('ctrl-on') ? hideControls() : resetHideCtrl();
      } else if (state.currentIsVOD) {
        togglePlay(); resetHideCtrl();   // desktop: clicar no vídeo pausa/continua
      }
    });

    document.getElementById('btnRew').addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); });
    document.getElementById('btnFwd').addEventListener('click', () => { video.currentTime += 10; });

    const volRange = document.getElementById('volRange');
    const iconVol = document.getElementById('iconVol');
    volRange.addEventListener('input', () => { video.volume = +volRange.value; video.muted = video.volume === 0; updateVolIcon(); });
    document.getElementById('btnVol').addEventListener('click', () => { video.muted = !video.muted; if (!video.muted && video.volume === 0) { video.volume = 0.5; volRange.value = 0.5; } updateVolIcon(); });

    function updateVolIcon() {
      const v = video.volume; const m = video.muted;
      iconVol.innerHTML = (m || v === 0)
        ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
        : v < 0.5
          ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'
          : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
    }

    document.getElementById('btnFS').addEventListener('click', async () => {
      const w = document.getElementById('playerWrap');
      const elemFS = w.requestFullscreen || w.webkitRequestFullscreen;

      // iPhone: <div> NÃO suporta a Fullscreen API e screen.orientation.lock não existe.
      // Então forçamos PAISAGEM via CSS (gira o player 90° e preenche a tela). Funciona
      // mesmo com o bloqueio de rotação do iPhone ligado. Toca de novo para sair.
      if (!elemFS) {
        const on = w.classList.toggle('ios-fs');
        document.documentElement.classList.toggle('ios-fs-on', on);
        return;
      }

      // Desktop / Android / iPad
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
        return;
      }
      try { await (w.requestFullscreen?.() || w.webkitRequestFullscreen?.()); } catch {}
      if (matchMedia('(pointer: coarse)').matches && screen.orientation && screen.orientation.lock) {
        try { await screen.orientation.lock('landscape'); } catch {}
      }
    });
    // Ao sair do fullscreen (botão, gesto do sistema ou ESC) → libera a orientação
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) { try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch {} }
    });

    document.getElementById('btnFavPlayer').addEventListener('click', () => {
      if (state.currentChannel) { toggleFav(state.currentChannel); updateFavBtn(); }
    });

    document.getElementById('playerWrap').addEventListener('mousemove', resetHideCtrl);
  }

  // ===== IMPORT =====
  function setupImport() {
    const modal = document.getElementById('importModal');
    const open = () => { modal.classList.add('open'); document.body.style.overflow = 'hidden'; renderSavedLists(); };
    const close = () => { modal.classList.remove('open'); document.body.style.overflow = ''; };

    document.getElementById('btnAddList')?.addEventListener('click', open);   // botão removido do cabeçalho
    document.getElementById('btnHeroImport')?.addEventListener('click', open);
    document.getElementById('importClose').addEventListener('click', close);
    document.getElementById('importBg').addEventListener('click', close);

    // Tabs
    document.querySelectorAll('.import-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        ['tabUrl', 'tabFile', 'tabSaved'].forEach(id => document.getElementById(id).classList.add('hidden'));
        document.getElementById('tab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)).classList.remove('hidden');
      });
    });

    // Load URL
    document.getElementById('btnLoadUrl').addEventListener('click', async () => {
      const url = document.getElementById('m3uUrl').value.trim();
      if (!url) { showToast('⚠ Cole a URL da lista M3U', true); return; }
      await loadM3UFromUrl(url);
      close();
    });

    // File upload
    document.getElementById('btnPickFile').addEventListener('click', () => document.getElementById('m3uFile').click());
    document.getElementById('m3uFile').addEventListener('change', (e) => { if (e.target.files[0]) loadM3UFromFile(e.target.files[0]); });

    // Drag & drop
    const drop = document.getElementById('fileDrop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) { loadM3UFromFile(file); document.getElementById('importModal').classList.remove('open'); document.body.style.overflow = ''; }
    });
  }

  async function loadM3UFromUrl(url) {
    showImportProgress('Conectando ao servidor...', 15);
    try {
      // Proxy server-side classifica em canais/filmes/séries. Carrega "Canais" primeiro.
      showImportProgress('Baixando e classificando conteúdo...', 45);
      state.listUrl = url;
      state.kindData = { live: null, movie: null, series: null };
      const data = await fetchKind('live', url);
      if (!data) throw new Error('Falha ao processar a lista.');

      updateCounts(data.counts);
      saveListMeta(url, 'Lista IPTV', data.counts.live + data.counts.movie + data.counts.series);

      state.activeKind = 'live';
      applyKindData('live', data);
      showImportProgress(`✓ ${data.counts.live.toLocaleString('pt-BR')} canais · ${data.counts.movie.toLocaleString('pt-BR')} filmes · ${data.counts.series.toLocaleString('pt-BR')} séries`, 100);
      setTimeout(() => {
        hideImportProgress();
        document.getElementById('importModal').classList.remove('open');
        document.body.style.overflow = '';
      }, 1900);
    } catch (err) {
      hideImportProgress();
      showToast('⚠ Erro ao carregar lista: ' + err.message, true);
    }
  }

  // Busca um tipo de conteúdo no proxy
  async function fetchKind(kind, url) {
    const res = await fetch('/api/list?kind=' + kind + '&url=' + encodeURIComponent(url || state.listUrl) + '&limit=6000&perGroup=60');
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
    return res.json();
  }

  // Aplica os dados de um tipo (canais + grupos) e renderiza
  function applyKindData(kind, data) {
    state.kindData[kind] = { channels: data.channels, groups: data.groups };
    state.channels = data.channels;
    state.activeGroup = 'all';
    buildCategoryPills();
    renderAll();
  }

  // Troca de aba de tipo (carrega sob demanda)
  async function loadKind(kind) {
    state.activeKind = kind;
    // atualiza UI das abas
    document.querySelectorAll('.kind-tab').forEach(t => t.classList.toggle('active', t.dataset.kind === kind));
    // placeholder de busca
    const si = document.getElementById('searchInput');
    if (si) si.placeholder = 'Buscar ' + KIND_LABELS[kind].toLowerCase() + '...';

    if (state.kindData[kind]) { applyKindData(kind, { channels: state.kindData[kind].channels, groups: state.kindData[kind].groups }); return; }

    // carrega
    document.getElementById('mainContent').innerHTML = '<div class="series-loading">Carregando ' + KIND_LABELS[kind].toLowerCase() + '…</div>';
    try {
      const data = await fetchKind(kind, state.listUrl);
      updateCounts(data.counts);
      applyKindData(kind, data);
      if (!data.channels.length) {
        document.getElementById('mainContent').innerHTML = '<div class="empty-list"><p>Nenhum ' + KIND_LABELS[kind].toLowerCase() + ' nesta lista.</p></div>';
      }
    } catch (err) {
      showToast('⚠ ' + err.message, true);
    }
  }

  function updateCounts(counts) {
    if (!counts) return;
    state.counts = counts;
    const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n != null ? n.toLocaleString('pt-BR') : ''; };
    set('countLive', counts.live);
    set('countMovie', counts.movie);
    set('countSeries', counts.series);
  }

  function setupKindTabs() {
    document.querySelectorAll('.kind-tab').forEach(tab => {
      tab.addEventListener('click', () => { if (state.listUrl) loadKind(tab.dataset.kind); else showToast('Importe uma lista primeiro.'); });
    });
  }

  function loadM3UFromFile(file) {
    showImportProgress('Lendo arquivo...', 30);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        showImportProgress('Processando canais...', 70);
        const channels = parseM3U(e.target.result);
        if (!channels.length) throw new Error('Nenhum canal encontrado.');
        saveListMeta(file.name, file.name, channels.length);
        applyChannels(channels);
        showImportProgress(`✓ ${channels.length} canais carregados!`, 100);
        setTimeout(() => { hideImportProgress(); document.getElementById('importModal').classList.remove('open'); document.body.style.overflow = ''; }, 1200);
      } catch (err) {
        hideImportProgress();
        showToast('⚠ ' + err.message, true);
      }
    };
    reader.readAsText(file);
  }

  function applyChannels(channels) {
    state.channels = channels;
    // Listas grandes podem estourar a quota do localStorage — persiste o que couber, senão fica em memória
    try { store.saveChannels(channels); } catch { /* quota excedida — segue só em memória */ }
    state.activeGroup = 'all';
    buildCategoryPills();
    renderAll();
    showToast(`✓ ${channels.length} canais carregados`);
  }

  function saveListMeta(src, name, count) {
    const lists = store.lists();
    const existing = lists.findIndex(l => l.src === src);
    const entry = { src, name: name.replace(/\.m3u8?$/, ''), count, date: new Date().toLocaleDateString('pt-BR') };
    if (existing >= 0) lists[existing] = entry; else lists.unshift(entry);
    store.saveLists(lists.slice(0, 10));
    // Sincroniza listas por URL no Supabase (carrega sozinha em qualquer dispositivo)
    if (typeof TVFunDB !== 'undefined' && /^https?:\/\//i.test(src)) TVFunDB.saveList(entry.name, src, count).catch(() => {});
  }

  function showImportProgress(msg, pct) {
    const el = document.getElementById('importProgress');
    el.classList.remove('hidden');
    document.getElementById('importProgressFill').style.width = pct + '%';
    document.getElementById('importStatus').textContent = msg;
  }
  function hideImportProgress() {
    document.getElementById('importProgress').classList.add('hidden');
    document.getElementById('importProgressFill').style.width = '0%';
  }

  function renderSavedLists() {
    const lists = store.lists();
    const wrap = document.getElementById('savedLists');
    if (!lists.length) { wrap.innerHTML = '<p class="no-saved">Nenhuma lista salva ainda.</p>'; return; }
    wrap.innerHTML = lists.map((l, i) => `
      <div class="saved-item">
        <div class="saved-item-info">
          <p>${l.name}</p>
          <span>${l.count} canais · ${l.date}</span>
        </div>
        <div class="saved-item-actions">
          <button class="btn-ghost" onclick="window.__tvfun.reloadList(${i})">Carregar</button>
          <button class="btn-danger" onclick="window.__tvfun.removeList(${i})">✕</button>
        </div>
      </div>`).join('');
  }

  // ===== CATEGORY PILLS =====
  function buildCategoryPills() {
    const groups = [...new Set(state.channels.map(c => c.group))].sort();
    const cats = document.getElementById('navCats');
    cats.innerHTML = '';

    const pills = [
      { label: 'Todos', group: 'all' },
      { label: '❤ Favoritos', group: 'Favoritos' },
      ...groups.map(g => ({ label: g, group: g })),
    ];

    pills.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'cat-pill' + (p.group === state.activeGroup ? ' active' : '');
      btn.textContent = p.label;
      btn.dataset.group = p.group;
      btn.addEventListener('click', () => {
        state.activeGroup = p.group;
        document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderRows();
      });
      cats.appendChild(btn);
    });
  }

  // ===== SEARCH =====
  function setupSearch() {
    const toggle = document.getElementById('searchToggle');
    const input = document.getElementById('searchInput');

    toggle.addEventListener('click', () => {
      state.searchOpen = !state.searchOpen;
      input.classList.toggle('open', state.searchOpen);
      if (state.searchOpen) input.focus();
      else { input.value = ''; showNormal(); }
    });

    input.addEventListener('input', () => {
      const q = input.value.trim();
      q.length >= 1 ? doSearch(q) : showNormal();
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { input.value = ''; input.classList.remove('open'); state.searchOpen = false; showNormal(); }
    });
  }

  function doSearch(q) {
    const ql = q.toLowerCase();
    const results = state.channels.filter(c =>
      c.name.toLowerCase().includes(ql) || c.group.toLowerCase().includes(ql)
    );
    document.getElementById('hero').style.display = 'none';
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('searchResults').classList.remove('hidden');
    document.getElementById('searchHeading').innerHTML = `Resultados para "<span>${q}</span>" — ${results.length} canal(is)`;
    const grid = document.getElementById('searchGrid');
    grid.innerHTML = '';
    if (results.length) {
      document.getElementById('searchEmpty').classList.add('hidden');
      results.forEach(ch => grid.appendChild(buildCard(ch)));
    } else {
      document.getElementById('searchEmpty').classList.remove('hidden');
    }
  }

  function showNormal() {
    document.getElementById('hero').style.display = '';
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('searchResults').classList.add('hidden');
  }

  // ===== HERO MUTE =====
  function setupMute() {
    const video = document.getElementById('heroVideo');
    const icon = document.getElementById('muteIcon');
    const UNMUTED = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`;
    const MUTED = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
    document.getElementById('muteBtn')?.addEventListener('click', () => {
      state.heroMuted = !state.heroMuted;
      video.muted = state.heroMuted;
      icon.innerHTML = state.heroMuted ? MUTED : UNMUTED;
    });
  }

  // ===== SCROLL NAVBAR =====
  function setupScroll() {
    const nav = document.getElementById('navbar');
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const cats = document.getElementById('navCats');
    document.getElementById('catLeft')?.addEventListener('click', () => cats.scrollBy({ left: -200, behavior: 'smooth' }));
    document.getElementById('catRight')?.addEventListener('click', () => cats.scrollBy({ left: 200, behavior: 'smooth' }));
  }

  // ===== MODAL CLOSES & KEYBOARD =====
  function setupModals() {
    document.getElementById('playerClose').addEventListener('click', closePlayer);
    document.getElementById('playerBg').addEventListener('click', closePlayer);
    document.getElementById('seriesClose')?.addEventListener('click', closeSeries);
    document.getElementById('seriesBg')?.addEventListener('click', closeSeries);

    document.getElementById('ddClearList')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Remover a lista atual e todo o conteúdo?')) {
        localStorage.removeItem(KEYS.channels);
        state.channels = [];
        state.activeGroup = 'all';
        state.listUrl = null;
        state.kindData = { live: null, movie: null, series: null };
        state.heroPlayer = destroyPlayer(state.heroPlayer);
        updateCounts({ live: 0, movie: 0, series: 0 });
        buildCategoryPills();
        renderAll();
        showToast('Lista removida.');
      }
    });

    document.addEventListener('keydown', e => {
      const playerOpen = document.getElementById('playerModal').classList.contains('open');
      const importOpen = document.getElementById('importModal').classList.contains('open');
      const seriesOpen = document.getElementById('seriesModal').classList.contains('open');
      if (e.key === 'Escape') {
        if (playerOpen) closePlayer();
        else if (seriesOpen) closeSeries();
        if (importOpen) { document.getElementById('importModal').classList.remove('open'); document.body.style.overflow = ''; }
      }
      if (!playerOpen) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const v = document.getElementById('videoEl'); v.paused ? v.play() : v.pause(); }
      if (e.key === 'ArrowLeft') document.getElementById('videoEl').currentTime -= 10;
      if (e.key === 'ArrowRight') document.getElementById('videoEl').currentTime += 10;
      if (e.key === 'ArrowUp') { const v = document.getElementById('videoEl'); v.volume = Math.min(1, v.volume + 0.1); }
      if (e.key === 'ArrowDown') { const v = document.getElementById('videoEl'); v.volume = Math.max(0, v.volume - 0.1); }
    });
  }

  // ===== DEMO =====
  function loadDemo() {
    const channels = parseM3U(DEMO_M3U);
    applyChannels(channels);
    showToast('✓ Lista demo carregada — substitua pela sua lista M3U');
  }

  // ===== TOAST =====
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ===== GLOBAL API (for saved list buttons) =====
  window.__tvfun = {
    reloadList: async (idx) => {
      const lists = store.lists();
      const l = lists[idx];
      if (!l) return;
      if (l.src.startsWith('http')) { await loadM3UFromUrl(l.src); }
      else { showToast('Recarregue o arquivo manualmente.'); }
      document.getElementById('importModal').classList.remove('open');
      document.body.style.overflow = '';
    },
    removeList: (idx) => {
      const lists = store.lists();
      lists.splice(idx, 1);
      store.saveLists(lists);
      renderSavedLists();
      showToast('Lista removida.');
    },
  };

  // ===== AUTH NAV SETUP (Supabase) =====
  async function setupAuthNav() {
    if (typeof TVFunDB === 'undefined') return;

    // Logout
    document.getElementById('ddLogout')?.addEventListener('click', e => {
      e.preventDefault();
      if (confirm('Deseja sair da sua conta?')) TVFunDB.signOut();
    });

    // Nome do usuário + plano no dropdown
    const [profile, sub] = await Promise.all([
      TVFunDB.getProfile(),
      TVFunDB.getActiveSubscription(),
    ]);

    const displayName = profile?.name || 'Usuário';
    const nameEl = document.querySelector('.user-name');
    if (nameEl) nameEl.textContent = displayName.split(' ')[0];
    const planEl = document.querySelector('.user-plan');
    if (planEl) planEl.textContent = sub?.plan_name ? `${sub.plan_name} ✓` : 'Sem plano ativo';
    const avatarEl = document.querySelector('.avatar:not(.sm)');
    if (avatarEl) avatarEl.textContent = displayName[0].toUpperCase();

    // (Removido) Banner de plano expirado na home — o status do plano aparece só na Conta/Planos.
  }

  // ===== INIT =====
  async function init() {
    // ── Auth guard async ──────────────────────
    if (typeof TVFunDB !== 'undefined') {
      const user = await TVFunDB.requireAuth();
      if (!user) return; // redirect em andamento
      // Preload Supabase data em paralelo
      const [favIds, history, lists, progress] = await Promise.all([
        TVFunDB.getFavoriteIds(),
        TVFunDB.getHistory(12),
        TVFunDB.getLists(),
        TVFunDB.getProgressList ? TVFunDB.getProgressList(12) : [],
      ]);
      state.favIds = favIds;
      state.recentChannels = history;
      state.savedLists = lists;
      state.progressList = mergeProgress(localProgressList(), progress || []);
    } else {
      // Fallback localStorage
      state.favIds = store.favorites();
      state.recentChannels = store.recents();
      state.savedLists = store.lists();
      state.progressList = localProgressList();
    }

    setupAuthNav();   // async (não bloqueia render)
    setupScroll();
    setupSearch();
    setupMute();
    setupPlayerControls();
    setupModals();
    setupImport();
    setupKindTabs();
    setupTrial();
    populateAmbWall();
    setupTrialCountdown();
    setupExpiryNotice();   // aviso de vencimento (≤5 dias) — só informativo
    setupTvNavigation();   // navegação por controle remoto (TV/box/Firestick)

    document.getElementById('btnLoadDemo')?.addEventListener('click', loadDemo);

    // ── Auto-carregamento da lista pessoal (credenciais provisionadas no Supabase) ──
    // O usuário NÃO digita m3u: se já tem credencial ativa, a lista carrega sozinha.
    if (typeof TVFunDB !== 'undefined') {
      const m3u = await TVFunDB.getMyM3uUrl().catch(() => null);
      if (m3u) { showEmpty(); loadM3UFromUrl(m3u); return; }
    }

    const saved = store.channels();
    if (saved && saved.length) {
      state.channels = saved;
      buildCategoryPills();
      renderAll();
      return;
    }
    // Lista salva (Supabase = entre dispositivos, ou local) com URL → carrega sozinha
    const supaLists = (state.savedLists && state.savedLists.length) ? state.savedLists : [];
    const lists = supaLists.length ? supaLists : store.lists();
    const lastUrl = (lists || []).map(l => l && (l.url || l.src)).find(u => /^https?:\/\//i.test(u || ''));
    if (lastUrl) { showEmpty(); loadM3UFromUrl(lastUrl); return; }
    showEmpty();
  }

  document.addEventListener('DOMContentLoaded', () => { init().catch(console.error); });
})();
