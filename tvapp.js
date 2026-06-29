/* TV Fun — app nativo de TV (webOS) v2. Home menu, 2 colunas, capas, detalhes, busca, settings, player anti-travamento. */
(function () {
  'use strict';
  var API = 'https://projeto01-tvfun.grgyfj.easypanel.host';
  var COLS = 6;

  function $(id) { return document.getElementById(id); }
  var scLogin = $('scLogin'), scMenu = $('scMenu'), scBrowse = $('scBrowse'), scDetails = $('scDetails'), scSettings = $('scSettings'), playerEl = $('player');
  var video = $('video');
  var inEmail = $('inEmail'), inPass = $('inPass'), btnLogin = $('btnLogin'), msgLogin = $('msgLogin'), who = $('who');
  var brBack = $('brBack'), brTtl = $('brTtl'), brSearch = $('brSearch'), catsEl = $('cats'), gridEl = $('grid');
  var livePrev = $('livePrev'), pvVideo = $('pvVideo'), pvName = $('pvName');
  var rowsEl = $('rows'), contentEl = document.querySelector('.content'), loadingEl = $('loading');
  var pvEngine = null, previewCh = null;
  var rowsData = [], curRow = 0, curCol = 0, fullShelves = [];
  var kindProg = [], kindFavs = [], kindCache = {};
  var detCover = $('detCover'), detTitle = $('detTitle'), detMeta = $('detMeta'), detActions = $('detActions'), detEps = $('detEps'), detBackdrop = $('detBackdrop'), detSynopsis = $('detSynopsis');
  var stUser = $('stUser'), stPass = $('stPass'), stHost = $('stHost'), stSave = $('stSave'), stMsg = $('stMsg'), stLogout = $('stLogout'), stBack = $('stBack');
  var plName = $('plName'), plTime = $('plTime'), plBar = $('plBar'), plFill = $('plFill'), nextEpBtn = $('nextEp'), plSpin = $('plSpin');
  var menuCards = [].slice.call(document.querySelectorAll('.menu-card'));

  var view = 'login', m3uUrl = null;
  var loginEls = [inEmail, inPass, btnLogin], loginIdx = 0;
  var menuIdx = 0;
  var curKind = 'live', brChannels = [], brCats = [], brCat = '__all__', brList = [], brZone = 'grid', topIdx = 0, catIdx = 0, gridIdx = 0, searchText = '';
  var detSeason = $('detSeason'), seasonDrop = $('seasonDrop');
  var detItem = null, detKind = 'movie', detRows = [], detRow = 0, detCol = 0;
  var detSeasonKeys = [], detSeasonsData = {}, detSeasonIdx = 0, detCurEps = [];
  var seasonDropOpen = false, dropIdx = 0;
  var setEls = [stBack, stUser, stPass, stHost, stSave, stLogout], setIdx = 0;
  var playEngine = null, queue = [], qIdx = -1, isVOD = false, prevView = 'browse', curPlaying = null, progTimer = null, ctrlTimer = null, resumeSec = 0;

  function showView(v) {
    if (view !== v) fxPlay();
    scLogin.classList.toggle('on', v === 'login');
    scMenu.classList.toggle('on', v === 'menu');
    scBrowse.classList.toggle('on', v === 'browse');
    scDetails.classList.toggle('on', v === 'details');
    scSettings.classList.toggle('on', v === 'settings');
    playerEl.classList.toggle('on', v === 'player');
    view = v;
  }
  // ---------- SHADER DE TRANSIÇÃO (WebGL puro, com fallback) ----------
  var fxCanvas = $('fxCanvas'), fxReady = false, fxGl = null, fxUTime = null, fxURes = null, fxRunning = false, fxRaf = 0, fxT0 = 0, fxHide = 0;
  function fxInit() {
    try {
      var gl = fxCanvas.getContext('webgl') || fxCanvas.getContext('experimental-webgl');
      if (!gl) return;
      function mk(t, s) { var sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null; }
      var vs = mk(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}');
      var fs = mk(gl.FRAGMENT_SHADER, 'precision highp float;uniform vec2 resolution;uniform float time;void main(void){vec2 uv=(gl_FragCoord.xy*2.0-resolution.xy)/min(resolution.x,resolution.y);float t=time*0.05;float lw=0.002;vec3 c=vec3(0.0);for(int j=0;j<3;j++){for(int i=0;i<5;i++){c[j]+=lw*float(i*i)/abs(fract(t-0.01*float(j)+float(i)*0.01)*5.0-length(uv)+mod(uv.x+uv.y,0.2));}}gl_FragColor=vec4(c,1.0);}');
      if (!vs || !fs) return;
      var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
      gl.useProgram(pr);
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      var lp = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
      fxURes = gl.getUniformLocation(pr, 'resolution'); fxUTime = gl.getUniformLocation(pr, 'time');
      fxGl = gl; fxReady = true; fxResize();
    } catch (e) {}
  }
  function fxResize() { if (!fxReady) return; fxCanvas.width = Math.floor((fxCanvas.clientWidth || window.innerWidth) / 2); fxCanvas.height = Math.floor((fxCanvas.clientHeight || window.innerHeight) / 2); fxGl.viewport(0, 0, fxCanvas.width, fxCanvas.height); fxGl.uniform2f(fxURes, fxCanvas.width, fxCanvas.height); }
  function fxLoop() { if (!fxRunning) { fxRaf = 0; return; } try { fxGl.uniform1f(fxUTime, (performance.now() - fxT0) * 0.05); fxGl.drawArrays(fxGl.TRIANGLES, 0, 6); } catch (e) {} fxRaf = requestAnimationFrame(fxLoop); }
  function fxPlay() {
    if (!fxReady) return;
    if (!fxCanvas.width) fxResize();
    fxT0 = performance.now(); fxRunning = true; fxCanvas.style.opacity = '1';
    if (!fxRaf) fxRaf = requestAnimationFrame(fxLoop);
    if (fxHide) clearTimeout(fxHide);
    fxHide = setTimeout(function () { fxCanvas.style.opacity = '0'; setTimeout(function () { fxRunning = false; }, 340); }, 300);
  }
  function clearFocus() { [].forEach.call(document.querySelectorAll('.focused'), function (e) { e.classList.remove('focused'); }); }
  function focusEl(el) { clearFocus(); if (el) { el.classList.add('focused'); try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {} } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function openKb(el) { try { el.focus(); el.click(); } catch (_) {} }

  // ---------- LOGIN ----------
  function renderLogin() { showView('login'); loginIdx = 0; focusEl(loginEls[0]); }
  function loginKey(k, e) {
    if (k === 38) { loginIdx = Math.max(0, loginIdx - 1); focusEl(loginEls[loginIdx]); e.preventDefault(); }
    else if (k === 40) { loginIdx = Math.min(2, loginIdx + 1); focusEl(loginEls[loginIdx]); e.preventDefault(); }
    else if (k === 13) { var el = loginEls[loginIdx]; if (el === btnLogin) { doLogin(); e.preventDefault(); } else openKb(el); }
  }
  function doLogin() {
    var email = (inEmail.value || '').trim(), pass = inPass.value || '';
    if (!email || !pass) { msgLogin.className = 'msg'; msgLogin.textContent = 'Preencha e-mail e senha.'; return; }
    msgLogin.className = 'msg'; msgLogin.textContent = 'Entrando…';
    TVFunDB.signIn(email, pass).then(function (r) {
      if (r && r.ok) { m3uUrl = null; preloadThenMenu(); }
      else { msgLogin.textContent = (r && r.error) || 'Falha ao entrar.'; }
    }).catch(function (err) { msgLogin.textContent = 'Erro: ' + err; });
  }

  // ---------- MENU ----------
  function openMenu() {
    showView('menu'); menuIdx = 0; focusEl(menuCards[0]);
    TVFunDB.getUser().then(function (u) { who.textContent = u ? u.email : ''; });
    if (!m3uUrl) TVFunDB.getMyM3uUrl().then(function (u) { m3uUrl = u; prefetchAll(); });
    else prefetchAll();
  }
  function getList(kind) {
    if (kindCache[kind]) return Promise.resolve(kindCache[kind]);
    var url = API + '/api/list?kind=' + kind + '&url=' + encodeURIComponent(m3uUrl) + '&limit=8000&perGroup=2000';
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) { kindCache[kind] = { channels: (d && d.channels) || [], groups: (d && d.groups) || [] }; return kindCache[kind]; }, function () { return { channels: [], groups: [] }; });
  }
  function prefetchAll() { if (m3uUrl) { getList('live'); getList('movie'); getList('series'); } }
  function preloadImages(list, n) { for (var i = 0; i < Math.min(n, (list || []).length); i++) { if (list[i] && list[i].logo) { var im = new Image(); im.src = list[i].logo; } } }
  function preloadThenMenu() {
    loadingEl.classList.add('on');
    function done() { loadingEl.classList.remove('on'); openMenu(); }
    function warm() {
      Promise.all([getList('live'), getList('movie'), getList('series')]).then(function (res) {
        try { preloadImages((res[1] && res[1].channels) || [], 40); preloadImages((res[2] && res[2].channels) || [], 40); } catch (e) {}
        done();
      }, done);
    }
    if (!m3uUrl) TVFunDB.getMyM3uUrl().then(function (u) { m3uUrl = u; if (!u) done(); else warm(); }, done);
    else warm();
  }
  function menuKey(k, e) {
    var col = menuIdx % 2;
    if (k === 37 && col > 0) menuIdx--;
    else if (k === 39 && col < 1 && menuIdx + 1 < menuCards.length) menuIdx++;
    else if (k === 38 && menuIdx - 2 >= 0) menuIdx -= 2;
    else if (k === 40 && menuIdx + 2 < menuCards.length) menuIdx += 2;
    else if (k === 13) { var go = menuCards[menuIdx].getAttribute('data-go'); if (go === 'settings') openSettings(); else if (go === 'fav') openFavorites(); else openBrowse(go); e.preventDefault(); return; }
    else return;
    focusEl(menuCards[menuIdx]); e.preventDefault();
  }
  function openFavorites() {
    curKind = 'fav'; searchText = ''; brSearch.value = ''; brCat = '__all__';
    brTtl.textContent = '❤ Favoritos';
    stopPreview(); previewCh = null; livePrev.classList.remove('on');
    COLS = 5; gridEl.style.gridTemplateColumns = 'repeat(5, 1fr)'; gridEl.style.gridAutoRows = '470px';
    showView('browse'); brZone = 'grid'; gridIdx = 0;
    catsEl.innerHTML = '<div class="cat sel">❤ Favoritos</div>'; brCats = [{ name: '__all__', count: 0 }]; catIdx = 0;
    gridEl.innerHTML = '<div class="empty">Carregando…</div>';
    function load() {
      TVFunDB.getFavorites().then(function (rows) {
        brChannels = (rows || []).map(function (r) { return { name: r.name, url: r.url, logo: r.logo, group: r.group_name || r.group || '', kind: r.kind || 'movie', series: r.name }; });
        if (!brChannels.length) { gridEl.innerHTML = '<div class="empty">Você ainda não favoritou nada. Use o ❤ nos detalhes.</div>'; return; }
        renderGrid(); brZone = 'grid'; gridIdx = 0; hlGrid();
      }).catch(function (e) { gridEl.innerHTML = '<div class="empty">Erro: ' + esc(e) + '</div>'; });
    }
    load();
  }

  // ---------- BROWSE ----------
  function openBrowse(kind) {
    curKind = kind; searchText = ''; brSearch.value = ''; brCat = '__all__';
    brTtl.textContent = kind === 'live' ? 'Canais' : kind === 'movie' ? 'Filmes' : 'Séries';
    stopPreview(); previewCh = null;
    var isLive = (kind === 'live');
    showView('browse');
    livePrev.classList.toggle('on', isLive);
    catsEl.style.display = ''; contentEl.style.display = ''; rowsEl.classList.remove('on');
    brZone = 'cats'; catIdx = 0; gridIdx = 0;
    COLS = isLive ? 1 : 5;
    gridEl.style.gridTemplateColumns = 'repeat(' + COLS + ', 1fr)';
    gridEl.style.gridAutoRows = isLive ? '60px' : '490px';
    gridEl.innerHTML = '<div class="empty">Carregando…</div>'; catsEl.innerHTML = '';
    function withM3u(cb) { if (m3uUrl) { cb(); return; } TVFunDB.getMyM3uUrl().then(function (u) { m3uUrl = u; if (!u) { gridEl.innerHTML = '<div class="empty">Sua conta não tem acesso IPTV ativo. Ative no app do celular.</div>'; } else cb(); }); }
    withM3u(function () {
      Promise.all([
        getList(kind),
        TVFunDB.getProgressList(30).then(function (x) { return x; }, function () { return []; }),
        TVFunDB.getFavorites().then(function (x) { return x; }, function () { return []; })
      ]).then(function (res) {
        var data = res[0] || {};
        brChannels = data.channels || [];
        var prog = (res[1] || []).filter(function (p) { return (p.kind || 'movie') === kind; }).sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
        if (kind === 'series') {
          var seen = {}; kindProg = [];
          prog.forEach(function (p) {
            var best = null, pn = p.name || '';
            for (var ci = 0; ci < brChannels.length; ci++) { var c = brChannels[ci]; if (c.name && c.name.length > 3 && pn.indexOf(c.name) === 0 && (!best || c.name.length > best.name.length)) best = c; }
            var sKey = (best && best.name) || pn.replace(/\s*[Ss]\d{1,2}\s*[Ee]\d{1,3}.*$/, '').trim() || pn;
            if (seen[sKey]) return; seen[sKey] = 1;
            kindProg.push({ name: (best && best.name) || pn, url: p.url, logo: (best && best.logo) || p.logo, group: p.group, kind: 'series', series: sKey, _resume: true, position: p.position });
          });
        } else { kindProg = prog.map(function (p) { return { name: p.name, url: p.url, logo: p.logo, group: p.group, kind: kind, _resume: true, position: p.position }; }); }
        kindFavs = (res[2] || []).map(function (f) {
          var u = f.channel_url || '';
          var fk = /\/movie\//i.test(u) ? 'movie' : /\/series\//i.test(u) ? 'series' : 'live';
          return { name: f.channel_name, url: u, logo: f.channel_logo, group: f.channel_group || '', kind: fk, series: f.channel_name };
        }).filter(function (f) { return f.kind === kind; });
        brCats = [{ name: '__all__', count: brChannels.length }];
        if (kindProg.length) brCats.push({ name: '__cont__', count: kindProg.length });
        if (kindFavs.length) brCats.push({ name: '__fav__', count: kindFavs.length });
        brCats = brCats.concat(data.groups || []);
        renderCats(); renderGrid(); brZone = 'cats'; catIdx = 0; hlCats();
      }).catch(function (e) { gridEl.innerHTML = '<div class="empty">Erro: ' + esc(e) + '</div>'; });
    });
  }
  function mapItems(arr, kind) {
    return (arr || []).map(function (p) { return { name: p.name, url: p.url, logo: p.logo, group: p.group_name || p.group || '', kind: kind, series: p.name }; });
  }
  function buildShelves(kind, channels, groups, prog, favs) {
    var shelves = [];
    var cont = (prog || []).filter(function (p) { return (p.kind || 'movie') === kind; });
    if (kind === 'series') { var seen = {}; cont = cont.filter(function (p) { var key = (p.name || '').replace(/\s*[Ss]\d{1,2}\s*[Ee]\d{1,3}.*$/, '').trim(); if (seen[key]) return false; seen[key] = 1; return true; }); }
    var contItems = cont.map(function (p) { return { name: p.name, url: p.url, logo: p.logo, group: p.group_name || p.group || '', kind: kind, series: p.name }; });
    var favItems = (favs || []).filter(function (f) { return (f.kind || 'movie') === kind; }).map(function (f) { return { name: f.name, url: f.url, logo: f.logo, group: f.group_name || f.group || '', kind: kind, series: f.name }; });
    if (contItems.length) shelves.push({ title: '▶ Continuar assistindo', items: contItems });
    if (favItems.length) shelves.push({ title: '❤ Favoritos', items: favItems });
    var grouped = {};
    channels.forEach(function (c) { (grouped[c.group] = grouped[c.group] || []).push(c); });
    var gkeys = (groups && groups.length) ? groups.map(function (g) { return g.name; }) : Object.keys(grouped);
    gkeys.forEach(function (g) { if (grouped[g] && grouped[g].length) shelves.push({ title: g, items: grouped[g].slice(0, 40) }); });
    fullShelves = shelves;
    renderShelves(shelves, kind);
  }
  function renderShelves(shelves, kind) {
    rowsData = shelves;
    if (!shelves.length) { rowsEl.innerHTML = '<div class="empty">Nada por aqui.</div>'; return; }
    var contain = (kind === 'movie') ? ' contain' : '';
    var h = '';
    for (var r = 0; r < shelves.length; r++) {
      var s = shelves[r], cards = '';
      for (var c = 0; c < s.items.length; c++) {
        var it = s.items[c];
        var logo = it.logo ? String(it.logo).replace(/"/g, '%22') : '';
        var cv = logo ? '<img class="scv" loading="lazy" src="' + logo + '">' : '<div class="scv"></div>';
        cards += '<div class="scard' + contain + '" data-r="' + r + '" data-c="' + c + '">' + cv + '<div class="scl">' + esc(it.name || '—') + '</div></div>';
      }
      h += '<div class="shelf"><div class="shelf-title">' + esc(s.title) + '</div><div class="strip">' + cards + '</div></div>';
    }
    rowsEl.innerHTML = h;
    curRow = 0; curCol = 0; focusCard(0, 0);
  }
  function focusCard(r, c) {
    clearFocus();
    var el = rowsEl.querySelector('.scard[data-r="' + r + '"][data-c="' + c + '"]');
    if (el) { el.classList.add('focused'); try { el.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (_) {} }
  }
  function renderCats() {
    var h = '';
    for (var i = 0; i < brCats.length; i++) {
      var c = brCats[i];
      var nm = c.name === '__all__' ? 'Todos' : c.name === '__cont__' ? 'Continuar assistindo' : c.name === '__fav__' ? 'Favoritos' : c.name;
      h += '<div class="cat" data-i="' + i + '">' + esc(nm) + ' (' + c.count + ')</div>';
    }
    catsEl.innerHTML = h;
  }
  function curFilter() {
    var s = searchText.trim().toLowerCase();
    if (s) return brChannels.filter(function (c) { return (c.name || '').toLowerCase().indexOf(s) >= 0; }).slice(0, 500);
    if (brCat === '__cont__') return kindProg;
    if (brCat === '__fav__') return kindFavs;
    if (brCat === '__all__') return brChannels.slice(0, 500);
    return brChannels.filter(function (c) { return (c.group || '') === brCat; }).slice(0, 500);
  }
  function renderGrid() {
    brList = curFilter();
    if (!brList.length) { gridEl.innerHTML = '<div class="empty">Nada encontrado.</div>'; return; }
    var h = '';
    if (curKind === 'live') {
      for (var i = 0; i < brList.length; i++) {
        h += '<div class="card chrow" data-i="' + i + '"><div class="chnm">' + esc(brList[i].name || '—') + '</div></div>';
      }
    } else {
      var contain = curKind === 'movie' ? ' fit-contain' : '';
      for (var j = 0; j < brList.length; j++) {
        var cc = brList[j];
        var lg2 = cc.logo ? String(cc.logo).replace(/"/g, '%22') : '';
        var cover = lg2 ? '<img class="cv' + contain + '" loading="lazy" src="' + lg2 + '">' : '<div class="cv"></div>';
        h += '<div class="card" data-i="' + j + '">' + cover + '<div class="cl">' + esc(cc.name || '—') + '</div></div>';
      }
    }
    gridEl.innerHTML = h;
  }
  function cards() { return [].slice.call(gridEl.querySelectorAll('.card')); }
  function catEls() { return [].slice.call(catsEl.querySelectorAll('.cat')); }
  function hlCats() {
    clearFocus();
    var els = catEls();
    els.forEach(function (e, i) { e.classList.toggle('sel', i === catIdx); });
    if (els[catIdx]) focusEl(els[catIdx]);
  }
  function hlGrid() { var cs = cards(); if (cs[gridIdx]) focusEl(cs[gridIdx]); }
  function applyCat() {
    brCat = brCats[catIdx] ? brCats[catIdx].name : '__all__';
    gridIdx = 0; renderGrid();
    catEls().forEach(function (e, i) { e.classList.toggle('sel', i === catIdx); });
  }
  function browseKey(k, e) {
    e.preventDefault();
    if (brZone === 'top') {
      if (k === 37 && topIdx > 0) { topIdx--; brSearch.blur(); focusEl(brBack); }
      else if (k === 39 && topIdx < 1) { topIdx++; focusEl(brSearch); }
      else if (k === 40) { brSearch.blur(); brZone = 'cats'; hlCats(); }
      else if (k === 13) { if (topIdx === 0) openMenu(); else openKb(brSearch); }
      return;
    }
    if (brZone === 'rows') {
      if (!rowsData.length) return;
      var shelf = rowsData[curRow];
      if (k === 38) { if (curRow === 0) { brZone = 'top'; topIdx = 1; focusEl(brSearch); } else { curRow--; curCol = Math.min(curCol, rowsData[curRow].items.length - 1); focusCard(curRow, curCol); } }
      else if (k === 40) { if (curRow < rowsData.length - 1) { curRow++; curCol = Math.min(curCol, rowsData[curRow].items.length - 1); focusCard(curRow, curCol); } }
      else if (k === 37) { if (curCol > 0) { curCol--; focusCard(curRow, curCol); } }
      else if (k === 39) { if (curCol < shelf.items.length - 1) { curCol++; focusCard(curRow, curCol); } }
      else if (k === 13) { openItem(shelf.items[curCol]); }
      return;
    }
    if (brZone === 'cats') {
      if (k === 38) { if (catIdx === 0) { brZone = 'top'; topIdx = 1; focusEl(brSearch); } else { catIdx--; applyCat(); hlCats(); } }
      else if (k === 40) { catIdx = Math.min(catEls().length - 1, catIdx + 1); applyCat(); hlCats(); }
      else if (k === 39 || k === 13) { if (brList.length) { brZone = 'grid'; gridIdx = 0; hlGrid(); } }
      return;
    }
    // grid
    if (k === 37) { if (gridIdx % COLS === 0) { brZone = 'cats'; hlCats(); } else { gridIdx--; hlGrid(); } }
    else if (k === 39) { if (gridIdx % COLS !== COLS - 1 && gridIdx < brList.length - 1) { gridIdx++; hlGrid(); } }
    else if (k === 38) { if (gridIdx < COLS) { brZone = 'top'; topIdx = 1; focusEl(brSearch); } else { gridIdx -= COLS; hlGrid(); } }
    else if (k === 40) { gridIdx = Math.min(brList.length - 1, gridIdx + COLS); hlGrid(); }
    else if (k === 13) { openItem(brList[gridIdx]); }
  }
  function openItem(item) {
    if (!item) return;
    if (item._resume) { resumeItem(item); return; }
    if (curKind === 'live') {
      if (previewCh && previewCh.url === item.url) { play({ name: item.name, url: item.url, logo: item.logo, group: item.group, kind: 'live' }, null); }
      else { startPreview(item); }
      return;
    }
    if (curKind === 'fav') {
      if (item.kind === 'live') { play({ name: item.name, url: item.url, logo: item.logo, group: item.group, kind: 'live' }, null); }
      else { openDetails(item, item.kind === 'series' ? 'series' : 'movie'); }
      return;
    }
    openDetails(item, curKind);
  }
  function mkMpegts(src, vEl) {
    var p = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: src }, {
      enableWorker: false, enableStashBuffer: true, stashInitialSize: 1024,
      liveBufferLatencyChasing: false, liveSync: false,
      autoCleanupSourceBuffer: true, autoCleanupMaxBackwardDuration: 60, autoCleanupMinBackwardDuration: 30,
      lazyLoad: false, fixAudioTimestampGap: true, reuseRedirectedURL: true
    });
    p.attachMediaElement(vEl); p.load(); p.play();
    return p;
  }
  function startPreview(item) {
    previewCh = item; pvName.textContent = item.name || '';
    stopPreview();
    var src = API + '/api/stream?url=' + encodeURIComponent(item.url || '');
    try {
      if (window.mpegts && mpegts.isSupported()) pvEngine = mkMpegts(src, pvVideo);
      else { pvVideo.src = src; pvVideo.play(); }
    } catch (e) {}
  }
  function stopPreview() {
    try { if (pvEngine && pvEngine.destroy) pvEngine.destroy(); } catch (_) {}
    pvEngine = null;
    try { pvVideo.pause(); pvVideo.removeAttribute('src'); pvVideo.load(); } catch (_) {}
  }

  // ---------- DETAILS ----------
  function badge(kind) { var t = kind === 'series' ? 'Série' : kind === 'live' ? 'Canal' : 'Filme'; return '<span class="det-badge">' + t + '</span> '; }
  function loadInfo(item, kind) {
    detSynopsis.innerHTML = '';
    var q;
    if (kind === 'movie') { var u = item.url || '', m = u.match(/(\d+)\.[a-z0-9]+(?:\?|$)/i) || u.match(/\/(\d+)(?:\?|$)/); if (!m) return; q = 'type=movie&id=' + m[1]; }
    else { q = 'type=series&series=' + encodeURIComponent(item.series || item.name || ''); }
    fetch(API + '/api/info?url=' + encodeURIComponent(m3uUrl) + '&' + q).then(function (r) { return r.json(); }).then(function (info) {
      if (!info || view !== 'details' || detItem !== item) return;
      if (info.backdrop) detBackdrop.style.backgroundImage = "url('" + String(info.backdrop).replace(/['"\\]/g, '') + "')";
      if (info.cover) detCover.style.backgroundImage = "url('" + String(info.cover).replace(/['"\\]/g, '') + "')";
      var syn = info.plot ? esc(info.plot) : '';
      if (info.cast) syn += (syn ? '<br><br>' : '') + '<b style="color:#9a9aa5">Elenco:</b> ' + esc(info.cast);
      detSynopsis.innerHTML = syn;
    }).catch(function () {});
  }
  function openDetails(item, kind) {
    detItem = item; detKind = kind; showView('details');
    seasonDropOpen = false; seasonDrop.classList.remove('on');
    var bg = item.logo ? "url('" + String(item.logo).replace(/['"\\]/g, '') + "')" : '';
    detCover.style.backgroundImage = bg; detBackdrop.style.backgroundImage = bg;
    detTitle.textContent = item.name || '';
    detMeta.innerHTML = badge(kind) + (item.group ? esc(item.group) : '') + (kind === 'series' && item.episodeCount ? ' · ' + item.episodeCount + ' episódios' : '');
    detEps.innerHTML = ''; detSeason.innerHTML = '';
    detActions.innerHTML = '<div class="btn btn-watch" data-a="' + (kind === 'movie' ? 'play' : 'playep') + '">Assistir</div><div class="btn btn-fav" data-a="fav">Favoritar</div>';
    loadInfo(item, kind);
    if (kind === 'movie') { buildDetRows(); return; }
    detEps.innerHTML = '<div class="empty">Carregando episódios…</div>';
    var url = API + '/api/episodes?url=' + encodeURIComponent(m3uUrl) + '&series=' + encodeURIComponent(item.series || item.name) + '&group=' + encodeURIComponent(item.group || '');
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      detSeasonsData = (data && data.seasons) || {};
      detSeasonKeys = Object.keys(detSeasonsData).sort(function (a, b) { return (a - b) || 0; });
      detSeasonIdx = 0;
      var total = 0, sk; for (sk in detSeasonsData) total += detSeasonsData[sk].length;
      detMeta.innerHTML = badge('series') + (item.group ? esc(item.group) + ' · ' : '') + detSeasonKeys.length + ' temporada' + (detSeasonKeys.length === 1 ? '' : 's') + ' · ' + total + ' episódios';
      if (!detSeasonKeys.length) { detEps.innerHTML = '<div class="empty">Sem episódios.</div>'; buildDetRows(); return; }
      renderSeason(); buildDetRows();
    }).catch(function (e) { detEps.innerHTML = '<div class="empty">Erro: ' + esc(e) + '</div>'; buildDetRows(); });
  }
  function renderSeason() {
    var key = detSeasonKeys[detSeasonIdx];
    detCurEps = detSeasonsData[key] || [];
    detSeason.innerHTML = '<div class="btn btn-season" data-a="season">Temporada ' + esc(key) + '  ▾</div>';
    var h = '';
    for (var i = 0; i < detCurEps.length; i++) { h += '<div class="ep" data-i="' + i + '">E' + (detCurEps[i].episode || (i + 1)) + ' · ' + esc(detCurEps[i].name || '') + '</div>'; }
    detEps.innerHTML = h || '<div class="empty">Sem episódios nesta temporada.</div>';
  }
  function buildDetRows() {
    detRows = [];
    var acts = [].slice.call(detActions.querySelectorAll('.btn')); if (acts.length) detRows.push(acts);
    var seas = [].slice.call(detSeason.querySelectorAll('.btn')); if (seas.length) detRows.push(seas);
    [].forEach.call(detEps.querySelectorAll('.ep'), function (ep) { detRows.push([ep]); });
    detRow = 0; detCol = 0; focusDet();
  }
  function focusDet() {
    clearFocus();
    var row = detRows[detRow]; if (!row || !row.length) return;
    if (detCol >= row.length) detCol = row.length - 1;
    var el = row[detCol]; if (el) { el.classList.add('focused'); try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
  }
  function detailsKey(k, e) {
    if (seasonDropOpen) { seasonDropKey(k, e); return; }
    var row = detRows[detRow] || [];
    if (k === 38) { if (detRow > 0) { detRow--; focusDet(); } e.preventDefault(); }
    else if (k === 40) { if (detRow < detRows.length - 1) { detRow++; focusDet(); } e.preventDefault(); }
    else if (k === 37) { if (detCol > 0) { detCol--; focusDet(); } e.preventDefault(); }
    else if (k === 39) { if (detCol < row.length - 1) { detCol++; focusDet(); } e.preventDefault(); }
    else if (k === 13) {
      var el = row[detCol]; if (!el) return;
      var a = el.getAttribute('data-a');
      if (a === 'play') { play({ name: detItem.name, url: detItem.url, logo: detItem.logo, group: detItem.group, kind: 'movie' }, null); }
      else if (a === 'playep') { if (detCurEps.length) playEpisode(detCurEps, 0); }
      else if (a === 'fav') { favorite(detItem, detKind); }
      else if (a === 'season') { openSeasonDrop(); }
      else if (el.classList.contains('ep')) { var i = +el.getAttribute('data-i'); playEpisode(detCurEps, i); }
      e.preventDefault();
    }
  }
  function openSeasonDrop() {
    if (!detSeasonKeys.length) return;
    seasonDropOpen = true; dropIdx = detSeasonIdx;
    var h = '';
    for (var i = 0; i < detSeasonKeys.length; i++) h += '<div class="season-opt" data-i="' + i + '">Temporada ' + esc(detSeasonKeys[i]) + '</div>';
    seasonDrop.innerHTML = h;
    seasonDrop.style.top = (detSeason.offsetTop + 4) + 'px';
    seasonDrop.classList.add('on'); hlDrop();
  }
  function hlDrop() {
    [].forEach.call(seasonDrop.querySelectorAll('.season-opt'), function (el, i) { el.classList.toggle('focused', i === dropIdx); if (i === dropIdx) { try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {} } });
  }
  function closeSeasonDrop() { seasonDropOpen = false; seasonDrop.classList.remove('on'); }
  function seasonDropKey(k, e) {
    if (k === 461 || k === 8 || k === 27) { closeSeasonDrop(); focusDet(); e.preventDefault(); return; }
    if (k === 38) { dropIdx = Math.max(0, dropIdx - 1); hlDrop(); e.preventDefault(); }
    else if (k === 40) { dropIdx = Math.min(detSeasonKeys.length - 1, dropIdx + 1); hlDrop(); e.preventDefault(); }
    else if (k === 13) { detSeasonIdx = dropIdx; closeSeasonDrop(); renderSeason(); buildDetRows(); detRow = 1; detCol = 0; focusDet(); e.preventDefault(); }
  }
  function favorite(item, kind) {
    var ch = { name: item.name, url: item.url || (detCurEps[0] && detCurEps[0].url) || '', logo: item.logo, group: item.group, kind: kind };
    TVFunDB.toggleFavorite(ch).then(function (added) { toast(added ? 'Adicionado aos favoritos' : 'Removido dos favoritos'); var fb = detActions.querySelector('[data-a="fav"]'); if (fb) fb.classList.toggle('is-fav', !!added); }).catch(function () {});
  }

  // ---------- SETTINGS ----------
  function openSettings() {
    showView('settings'); setIdx = 0; focusEl(setEls[0]); stMsg.textContent = '';
    TVFunDB.getActiveCredentials().then(function (c) {
      var o = TVFunDB.credOverride && TVFunDB.credOverride();
      var u = (o && o.iptv_username) || (c && c.iptv_username) || '';
      var p = (o && o.iptv_password) || (c && c.iptv_password) || '';
      var h = (o && o.panel_host) || (c && c.panel_host) || '';
      stUser.value = u; stPass.value = p; stHost.value = h;
    }).catch(function () {});
  }
  function settingsKey(k, e) {
    if (k === 38) { setIdx = Math.max(0, setIdx - 1); focusEl(setEls[setIdx]); e.preventDefault(); }
    else if (k === 40) { setIdx = Math.min(setEls.length - 1, setIdx + 1); focusEl(setEls[setIdx]); e.preventDefault(); }
    else if (k === 13) {
      var el = setEls[setIdx];
      if (el === stBack) openMenu();
      else if (el === stSave) saveCreds();
      else if (el === stLogout) logout();
      else openKb(el);
      e.preventDefault();
    }
  }
  function saveCreds() {
    var u = (stUser.value || '').trim(), p = (stPass.value || '').trim(), h = (stHost.value || '').trim();
    if (!u || !p) { stMsg.className = 'msg'; stMsg.textContent = 'Informe usuário e senha.'; return; }
    stMsg.className = 'msg'; stMsg.textContent = 'Salvando…';
    TVFunDB.saveCredentials(u, p, h).then(function (r) {
      if (r && r.error) { stMsg.textContent = r.error; return; }
      m3uUrl = null; stMsg.className = 'msg ok'; stMsg.textContent = '✓ Credenciais salvas!';
    }).catch(function (e) { stMsg.textContent = 'Erro: ' + e; });
  }
  function logout() {
    try { TVFunDB.client.auth.signOut(); } catch (_) {}
    m3uUrl = null; inEmail.value = ''; inPass.value = ''; renderLogin();
  }

  // ---------- PLAYER ----------
  function play(item, q) {
    var from = view, rs = resumeSec; resumeSec = 0; curPlaying = item;
    if (from !== 'player') prevView = (from === 'details') ? 'details' : 'browse';
    showView('player'); plName.textContent = item.name || ''; plSpin.style.display = 'block';
    showCtrl();
    nextEpBtn.classList.remove('on');
    stopEngine(); stopPreview();
    var url = item.url || '', src = API + '/api/stream?url=' + encodeURIComponent(url);
    isVOD = item.kind !== 'live';
    plBar.classList.toggle('on', isVOD); plTime.classList.toggle('on', isVOD);
    video.onplaying = function () { plSpin.style.display = 'none'; };
    video.onerror = function () { plSpin.style.display = 'none'; plName.textContent = 'Falha ao abrir: ' + (item.name || ''); };
    video.ontimeupdate = onTime;
    video.onended = onEnded;
    video.onloadeddata = function () { if (rs > 0) { try { video.currentTime = rs; } catch (e) {} } };
    try {
      if (/\.m3u8(\?|$)/i.test(url) && window.Hls && Hls.isSupported()) {
        var hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 }); playEngine = hls;
        hls.loadSource(src); hls.attachMedia(video); hls.on(Hls.Events.MANIFEST_PARSED, function () { video.play(); });
      } else if (item.kind === 'live' && window.mpegts && mpegts.isSupported()) {
        playEngine = mkMpegts(src, video);
      } else { video.src = src; video.play(); }
    } catch (err) { plSpin.style.display = 'none'; plName.textContent = 'Erro: ' + err; }
    if (progTimer) clearInterval(progTimer);
    if (isVOD) progTimer = setInterval(saveProg, 20000);
  }
  function playEpisode(list, idx) { queue = list || []; qIdx = idx; var ep = queue[qIdx]; if (ep) play({ name: ep.name, url: ep.url, logo: detItem && detItem.logo, group: detItem && detItem.group, kind: 'series' }, true); }
  function playNextEp() { if (qIdx >= 0 && qIdx < queue.length - 1) { qIdx++; var ep = queue[qIdx]; play({ name: ep.name, url: ep.url, logo: detItem && detItem.logo, group: detItem && detItem.group, kind: 'series' }, true); } }
  function resumeItem(item) {
    resumeSec = (item.position && item.position > 30) ? item.position : 0;
    detItem = item; queue = []; qIdx = -1;
    if (item.kind !== 'series') { play(item); return; }
    var url = API + '/api/episodes?url=' + encodeURIComponent(m3uUrl) + '&series=' + encodeURIComponent(item.series || item.name) + '&group=' + encodeURIComponent(item.group || '');
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      var seasons = (data && data.seasons) || {}, keys = Object.keys(seasons).sort(function (a, b) { return (a - b) || 0; }), flat = [], i;
      for (i = 0; i < keys.length; i++) { (seasons[keys[i]] || []).forEach(function (ep) { flat.push(ep); }); }
      var idx = -1; for (i = 0; i < flat.length; i++) { if (flat[i].url === item.url) { idx = i; break; } }
      if (idx >= 0) { detSeasonKeys = keys; detSeasonsData = seasons; playEpisode(flat, idx); } else { play(item); }
    }).catch(function () { play(item); });
  }
  function hasNext() { return qIdx >= 0 && qIdx < queue.length - 1; }
  function onTime() {
    if (!isVOD || !video.duration) return;
    var pct = video.currentTime / video.duration;
    plFill.style.width = (pct * 100) + '%';
    plTime.textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
    if (hasNext() && (video.duration - video.currentTime) <= 60) nextEpBtn.classList.add('on'); else nextEpBtn.classList.remove('on');
  }
  function onEnded() { if (hasNext()) playNextEp(); }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); var m = Math.floor(s / 60), x = s % 60; return m + ':' + (x < 10 ? '0' : '') + x; }
  function seek(d) { if (isVOD && video.duration) { video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + d)); onTime(); } }
  function togglePause() { if (video.paused) video.play(); else video.pause(); }
  function showCtrl() { playerEl.classList.remove('ctrl-hidden'); if (ctrlTimer) clearTimeout(ctrlTimer); ctrlTimer = setTimeout(function () { playerEl.classList.add('ctrl-hidden'); }, 3000); }
  function saveProg() { try { if (isVOD && curPlaying && video.currentTime > 5) TVFunDB.saveProgress(curPlaying, video.currentTime, video.duration || 0); } catch (_) {} }
  function stopEngine() {
    try { if (playEngine && playEngine.destroy) playEngine.destroy(); } catch (_) {}
    playEngine = null;
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {}
  }
  function stopPlayer() {
    saveProg(); if (progTimer) { clearInterval(progTimer); progTimer = null; }
    stopEngine(); nextEpBtn.classList.remove('on');
    showView(prevView === 'details' ? 'details' : 'browse');
    if (prevView === 'details') { focusDet(); } else { hlGrid(); if (curKind === 'live' && previewCh) startPreview(previewCh); }
  }
  function playerKey(k, e) {
    if (k === 461 || k === 8 || k === 27) { stopPlayer(); e.preventDefault(); return; }
    showCtrl();
    if (k === 13) { if (nextEpBtn.classList.contains('on')) { playNextEp(); } else togglePause(); e.preventDefault(); }
    else if (k === 37) { seek(-10); e.preventDefault(); }
    else if (k === 39) { seek(10); e.preventDefault(); }
  }

  // ---------- TOAST ----------
  var toastT = null;
  function toast(msg) {
    var t = $('__toast'); if (!t) { t = document.createElement('div'); t.id = '__toast'; t.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:#e50914;color:#fff;font:22px Arial;padding:14px 28px;border-radius:30px;z-index:99;'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block'; if (toastT) clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = 'none'; }, 2200);
  }

  // ---------- KEYS ----------
  function onKey(e) {
    var k = e.keyCode || e.which;
    if (view === 'player') { playerKey(k, e); return; }
    if (k === 461 || k === 8 || k === 27) { // back
      if (view === 'browse') { stopPreview(); previewCh = null; openMenu(); e.preventDefault(); }
      else if (view === 'details') { if (seasonDropOpen) { closeSeasonDrop(); focusDet(); } else { showView('browse'); hlGrid(); } e.preventDefault(); }
      else if (view === 'settings') { openMenu(); e.preventDefault(); }
      return;
    }
    if (view === 'login') loginKey(k, e);
    else if (view === 'menu') menuKey(k, e);
    else if (view === 'browse') browseKey(k, e);
    else if (view === 'details') detailsKey(k, e);
    else if (view === 'settings') settingsKey(k, e);
  }
  document.addEventListener('keydown', onKey, false);

  // live search
  brSearch.addEventListener('input', function () { searchText = brSearch.value || ''; gridIdx = 0; renderGrid(); });
  brSearch.addEventListener('change', function () { brSearch.blur(); if (brList.length) { brZone = 'grid'; gridIdx = 0; hlGrid(); } });

  // ---------- BOOT ----------
  function boot() {
    if (typeof TVFunDB === 'undefined' || !TVFunDB.client) {
      document.body.innerHTML = '<div style="padding:60px;font:26px monospace;color:#f55">Erro: Supabase/Internet indisponível.<br>Verifique a conexão e reabra o app.</div>';
      return;
    }
    fxInit();
    window.addEventListener('resize', fxResize);
    TVFunDB.getUser().then(function (u) { if (u) preloadThenMenu(); else renderLogin(); }).catch(function () { renderLogin(); });
  }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
