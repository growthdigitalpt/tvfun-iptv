/* ============================================================
   TV Fun IPTV — server.js
   Servidor Node que:
   1. Serve os arquivos estáticos do app
   2. /api/list?url=  -> baixa e parseia a lista M3U server-side (resolve CORS da lista)
   3. /api/stream?url= -> faz proxy do stream MPEG-TS/HLS (resolve CORS + redirect HTTP + mixed-content)

   Rodar:  node server.js
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

const PORT = process.env.PORT || 3133;
const ROOT = __dirname;
const UA = 'VLC/3.0.20 (Linux; x86_64)';

// Cache simples de listas parseadas em memória (chave = url)
const listCache = new Map();

// Cache em DISCO da M3U crua — sobrevive a reinícios do servidor, então não re-baixa
// a lista inteira do provedor toda vez (essa era a causa da lentidão ao carregar).
const CACHE_DIR = path.join(ROOT, '.cache');
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
const DISK_TTL = 12 * 60 * 60 * 1000; // 12h — lista de IPTV muda pouco ao longo do dia
function cacheFile(url) { return path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.m3u'); }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// ─── Classificação de conteúdo ───────────────────────────────
// Xtream Codes: /series/ = série, /movie/ = filme, senão = canal ao vivo
function classifyKind(url) {
  if (/\/series\//i.test(url)) return 'series';
  if (/\/movie\//i.test(url)) return 'movie';
  return 'live';
}

// Extrai nome da série + temporada/episódio de "Nome (2013) S01E74" ou "Nome 1x05"
function parseSeriesInfo(name) {
  let m = name.match(/^(.*?)\s*[\[\(]?\s*S(\d{1,2})\s*E(\d{1,4})\b/i);
  if (m) return { series: cleanSeries(m[1]), season: +m[2], episode: +m[3] };
  m = name.match(/^(.*?)\s+(\d{1,2})x(\d{1,4})\b/i);
  if (m) return { series: cleanSeries(m[1]), season: +m[2], episode: +m[3] };
  return { series: cleanSeries(name), season: 1, episode: 0 };
}
function cleanSeries(s) { return s.replace(/\s*[\(\[]\d{4}[\)\]]\s*$/, '').replace(/[\s\-–]+$/, '').trim(); }

// ─── M3U parser (server-side) ────────────────────────────────
function parseM3U(text) {
  const lines = text.split('\n');
  const items = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      cur = { name: '', logo: '', group: 'Outros', url: '', id: '' };
      const nameMatch = line.match(/,(.*)$/);
      if (nameMatch) cur.name = nameMatch[1].trim();
      const attr = (k) => { const m = line.match(new RegExp(k + '="([^"]*)"')); return m ? m[1] : ''; };
      cur.logo = attr('tvg-logo');
      cur.group = attr('group-title') || 'Outros';
      cur.id = attr('tvg-id') || cur.name;
    } else if (cur && !line.startsWith('#')) {
      cur.url = line;
      cur.kind = classifyKind(line);
      if (cur.kind === 'series') {
        const s = parseSeriesInfo(cur.name);
        cur.series = s.series; cur.season = s.season; cur.episode = s.episode;
      }
      if (cur.name && cur.url) items.push(cur);
      cur = null;
    }
  }
  return items;
}

// Baixa, parseia e indexa a lista (cacheado por URL)
async function getProcessed(m3uUrl) {
  let proc = listCache.get(m3uUrl);
  if (proc) return proc;

  const t0 = Date.now();
  let text = null, fonte = 'rede';
  const cf = cacheFile(m3uUrl);

  // 1) cache em disco (local, rápido) se ainda estiver fresco
  try {
    const st = fs.statSync(cf);
    if (Date.now() - st.mtimeMs < DISK_TTL) { text = fs.readFileSync(cf, 'utf8'); fonte = 'disco'; }
  } catch {}

  // 2) senão, baixa do provedor e grava no disco para a próxima vez
  if (text == null) {
    const r = await fetch(m3uUrl, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' }, redirect: 'follow' });
    if (!r.ok) throw new Error(`lista retornou HTTP ${r.status}`);
    text = await r.text();
    try { fs.writeFileSync(cf, text); } catch {}
  }
  const items = parseM3U(text);

  const byKind = { live: [], movie: [], series: [] };
  const seriesIndex = new Map(); // seriesName → { series, group, logo, episodes:[] }
  for (const it of items) {
    byKind[it.kind].push(it);
    if (it.kind === 'series') {
      const key = it.series + '\u0000' + it.group;
      let s = seriesIndex.get(key);
      if (!s) { s = { series: it.series, group: it.group, logo: it.logo, episodes: [] }; seriesIndex.set(key, s); }
      if (!s.logo && it.logo) s.logo = it.logo;
      s.episodes.push(it);
    }
  }
  proc = {
    counts: { live: byKind.live.length, movie: byKind.movie.length, series: seriesIndex.size, seriesEpisodes: byKind.series.length },
    byKind, seriesIndex,
  };
  listCache.set(m3uUrl, proc);
  console.log(`[list] ${fonte}: indexou ${items.length} itens (${proc.counts.live} canais, ${proc.counts.movie} filmes, ${proc.counts.series} séries) em ${Date.now() - t0}ms`);
  return proc;
}

// agrupa itens por group-title, limitando por grupo e no total
function groupAndLimit(items, limit, perGroup) {
  const perGroupCount = new Map();
  const out = [];
  for (const it of items) {
    const g = it.group || 'Outros';
    const c = perGroupCount.get(g) || 0;
    if (c < perGroup && out.length < limit) { out.push(it); perGroupCount.set(g, c + 1); }
  }
  const allGroups = new Map();
  for (const it of items) allGroups.set(it.group, (allGroups.get(it.group) || 0) + 1);
  const groups = [...allGroups.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { out, groups };
}

// ─── /api/list?kind=live|movie|series ────────────────────────
async function handleList(req, res, urlObj) {
  const m3uUrl = urlObj.searchParams.get('url');
  const kind = urlObj.searchParams.get('kind') || 'live';
  const limit = parseInt(urlObj.searchParams.get('limit') || '4000', 10);
  const perGroup = parseInt(urlObj.searchParams.get('perGroup') || '80', 10);
  if (!m3uUrl) return json(res, 400, { error: 'parâmetro url ausente' });

  try {
    const proc = await getProcessed(m3uUrl);

    if (kind === 'series') {
      // agrupa por nome de série (cada série = 1 card) + capa real da API
      const covers = await getApiCovers(m3uUrl);
      const all = [...proc.seriesIndex.values()];
      const perGroupCount = new Map();
      const out = [];
      for (const s of all) {
        const g = s.group || 'Outros';
        const c = perGroupCount.get(g) || 0;
        if (c < perGroup && out.length < limit) {
          const capa = covers.series.get(normalizeName(s.series)) || '';   // sem match na API → vazio (cliente busca fallback/TMDB ou mostra inicial)
          out.push({ name: s.series, series: s.series, group: g, logo: capa, kind: 'series', episodeCount: s.episodes.length });
          perGroupCount.set(g, c + 1);
        }
      }
      const allGroups = new Map();
      for (const s of all) allGroups.set(s.group, (allGroups.get(s.group) || 0) + 1);
      const groups = [...allGroups.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      return json(res, 200, { kind, counts: proc.counts, total: all.length, returned: out.length, groups, channels: out });
    }

    // live ou movie
    const items = proc.byKind[kind] || [];
    const { out, groups } = groupAndLimit(items, limit, perGroup);
    if (kind === 'movie') {
      // capa real da API (por stream_id extraído da URL)
      const covers = await getApiCovers(m3uUrl);
      for (const o of out) { const id = vodIdFromUrl(o.url); const capa = id && covers.vod.get(id); if (capa) o.logo = capa; }
    }
    json(res, 200, { kind, counts: proc.counts, total: items.length, returned: out.length, groups, channels: out });
  } catch (e) {
    console.error('[list] erro:', e.message);
    json(res, 500, { error: e.message });
  }
}

// ─── /api/episodes?url=&series=&group= ───────────────────────
async function handleEpisodes(req, res, urlObj) {
  const m3uUrl = urlObj.searchParams.get('url');
  const series = urlObj.searchParams.get('series');
  const group = urlObj.searchParams.get('group') || '';
  if (!m3uUrl || !series) return json(res, 400, { error: 'parâmetros url e series obrigatórios' });

  try {
    const proc = await getProcessed(m3uUrl);
    const s = proc.seriesIndex.get(series + '\u0000' + group) ||
              [...proc.seriesIndex.values()].find(x => x.series === series);
    if (!s) return json(res, 404, { error: 'série não encontrada' });

    // ordena por temporada/episódio e agrupa por temporada
    const eps = [...s.episodes].sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
    const seasons = {};
    for (const e of eps) { (seasons[e.season] = seasons[e.season] || []).push({ name: e.name, url: e.url, season: e.season, episode: e.episode, logo: e.logo }); }
    json(res, 200, { series: s.series, group: s.group, logo: s.logo, total: eps.length, seasons });
  } catch (e) {
    console.error('[episodes] erro:', e.message);
    json(res, 500, { error: e.message });
  }
}

// ─── /api/stream ─────────────────────────────────────────────
async function handleStream(req, res, urlObj) {
  const streamUrl = urlObj.searchParams.get('url');
  if (!streamUrl) { res.writeHead(400); return res.end('url ausente'); }

  const controller = new AbortController();
  let done = false;
  const cleanup = () => { if (!done) { done = true; try { controller.abort(); } catch {} } };
  req.on('close', cleanup);
  res.on('close', cleanup);

  // Repassa Range (essencial para seek em filmes/séries VOD)
  const upstreamHeaders = { 'User-Agent': UA, 'Accept': '*/*' };
  if (req.headers.range) upstreamHeaders['Range'] = req.headers.range;

  try {
    const upstream = await fetch(streamUrl, {
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!upstream.ok || !upstream.body) {
      if (!res.headersSent) res.writeHead(502, { 'Access-Control-Allow-Origin': '*' });
      return res.end('upstream ' + upstream.status);
    }

    // Repassa status (200 ou 206) e headers de range para o player nativo poder buscar
    const outHeaders = {
      'Content-Type': upstream.headers.get('content-type') || 'video/mp2t',
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
      'Cache-Control': 'no-cache',
    };
    const cr = upstream.headers.get('content-range');
    const cl = upstream.headers.get('content-length');
    if (cr) outHeaders['Content-Range'] = cr;
    if (cl) outHeaders['Content-Length'] = cl;

    res.writeHead(upstream.status, outHeaders);
    try { res.socket && res.socket.setNoDelay(true); } catch {}  // sem Nagle → menos latência no stream ao vivo

    const nodeStream = Readable.fromWeb(upstream.body);
    // Sockets de vídeo quebram o tempo todo — engolir erros de pipe/abort sem derrubar o processo
    nodeStream.on('error', () => { try { res.end(); } catch {} });
    res.on('error', () => { try { nodeStream.destroy(); } catch {} });
    nodeStream.pipe(res);
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('[stream] erro:', e.message, streamUrl.slice(0, 80));
      if (!res.headersSent) { try { res.writeHead(502, { 'Access-Control-Allow-Origin': '*' }); } catch {} }
    }
    try { res.end(); } catch {}
  }
}

// ─── /api/info?type=movie|series&listUrl=&id=&series= ────────
// Metadados ricos da API Xtream (sinopse, elenco, gênero, pôster, backdrop)
const infoCache = new Map();
let seriesApiIndex = null; // nome → { series_id, plot, cover, genre, cast }

function xtreamBase(listUrl) {
  // deriva o player_api a partir da get.php
  const u = new URL(listUrl);
  const user = u.searchParams.get('username');
  const pass = u.searchParams.get('password');
  return { base: `${u.protocol}//${u.host}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`, user, pass };
}

async function handleInfo(req, res, urlObj) {
  const listUrl = urlObj.searchParams.get('listUrl') || urlObj.searchParams.get('url');
  const type = urlObj.searchParams.get('type') || 'movie';
  const id = urlObj.searchParams.get('id');
  const seriesName = urlObj.searchParams.get('series');
  if (!listUrl) return json(res, 400, { error: 'listUrl ausente' });

  try {
    const { base } = xtreamBase(listUrl);

    if (type === 'movie') {
      if (!id) return json(res, 400, { error: 'id ausente' });
      const ck = 'movie:' + id;
      if (infoCache.has(ck)) return json(res, 200, infoCache.get(ck));
      const r = await fetch(`${base}&action=get_vod_info&vod_id=${id}`, { headers: { 'User-Agent': UA } });
      const data = await r.json();
      const info = data.info || {};
      const out = {
        type: 'movie',
        name: info.name || '', plot: info.plot || info.description || '',
        cover: info.movie_image || info.cover_big || '',
        backdrop: Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : (info.backdrop_path || ''),
        genre: info.genre || '', cast: info.cast || info.actors || '', director: info.director || '',
        releaseDate: info.release_date || '', duration: info.episode_run_time || '',
        rating: info.rating || '', country: info.country || '', trailer: info.youtube_trailer || '',
      };
      infoCache.set(ck, out);
      return json(res, 200, out);
    }

    if (type === 'series') {
      // indexa get_series uma vez (nome → metadados)
      if (!seriesApiIndex) {
        const r = await fetch(`${base}&action=get_series`, { headers: { 'User-Agent': UA } });
        const arr = await r.json();
        seriesApiIndex = new Map();
        for (const s of (Array.isArray(arr) ? arr : [])) {
          seriesApiIndex.set(normalizeName(s.name || s.title || ''), {
            series_id: s.series_id, plot: s.plot || '', cover: s.cover || '',
            genre: s.genre || '', cast: s.cast || '', releaseDate: s.releaseDate || s.release_date || '', rating: s.rating || '',
          });
        }
        console.log(`[info] indexou ${seriesApiIndex.size} séries da API`);
      }
      const meta = seriesApiIndex.get(normalizeName(seriesName || '')) || {};
      return json(res, 200, { type: 'series', name: seriesName, ...meta });
    }

    json(res, 400, { error: 'type inválido' });
  } catch (e) {
    console.error('[info] erro:', e.message);
    json(res, 500, { error: e.message });
  }
}

function normalizeName(s) {
  return s.toLowerCase().replace(/\s*[\(\[]\d{4}[\)\]]\s*/g, ' ').replace(/[^\w\sáàâãéêíóôõúç]/gi, '').replace(/\s+/g, ' ').trim();
}

// ─── Capas reais da API Xtream para a HOME ───────────────────
// A M3U traz tvg-logo genérico/errado; a API tem a capa certa por título.
const coverCache = new Map(); // listUrl → { vod: Map(stream_id→capa), series: Map(nomeNorm→capa) }
function coverFile(url) { return path.join(CACHE_DIR, crypto.createHash('sha1').update('covers:' + url).digest('hex') + '.json'); }
function vodIdFromUrl(url) { const m = (url || '').match(/\/(\d+)\.\w+(\?|$)/); return m ? m[1] : null; }
async function fetchWithTimeout(url, ms = 15000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { headers: { 'User-Agent': UA }, signal: c.signal }); } finally { clearTimeout(t); }
}

async function getApiCovers(listUrl) {
  if (coverCache.has(listUrl)) return coverCache.get(listUrl);
  // 1) cache em disco
  try {
    const st = fs.statSync(coverFile(listUrl));
    if (Date.now() - st.mtimeMs < DISK_TTL) {
      const j = JSON.parse(fs.readFileSync(coverFile(listUrl), 'utf8'));
      const got = { vod: new Map(j.vod), series: new Map(j.series) };
      coverCache.set(listUrl, got);
      return got;
    }
  } catch {}
  // 2) busca da API Xtream (get_vod_streams + get_series) em paralelo
  const { base } = xtreamBase(listUrl);
  const vod = new Map(), series = new Map();
  await Promise.all([
    (async () => {
      try { const r = await fetchWithTimeout(`${base}&action=get_vod_streams`);
        for (const v of (await r.json()) || []) { const ic = v.stream_icon || v.cover || ''; if (v.stream_id != null && ic) vod.set(String(v.stream_id), ic); }
      } catch (e) { console.error('[covers] vod:', e.message); }
    })(),
    (async () => {
      try { const r = await fetchWithTimeout(`${base}&action=get_series`);
        for (const s of (await r.json()) || []) { const c = s.cover || ''; if (c) series.set(normalizeName(s.name || s.title || ''), c); }
      } catch (e) { console.error('[covers] series:', e.message); }
    })(),
  ]);
  const got = { vod, series };
  coverCache.set(listUrl, got);
  try { fs.writeFileSync(coverFile(listUrl), JSON.stringify({ vod: [...vod], series: [...series] })); } catch {}
  console.log(`[covers] ${vod.size} filmes, ${series.size} séries indexados da API`);
  return got;
}

// ─── /api/cover?type=movie|series&title= — fonte alternativa de capa (TMDB) ──
// Ativado por env TMDB_API_KEY (chave gratuita). Sem a chave, responde 404 (cliente mostra a inicial).
const TMDB_KEY = process.env.TMDB_API_KEY || '';
const tmdbCache = new Map();
async function handleCover(req, res, urlObj) {
  const title = (urlObj.searchParams.get('title') || '').trim();
  const tmdbType = urlObj.searchParams.get('type') === 'series' ? 'tv' : 'movie';
  const fail = () => { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end(); };
  const send = (u) => { res.writeHead(302, { Location: u, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=604800' }); res.end(); };
  if (!TMDB_KEY || !title) return fail();
  const ck = tmdbType + ':' + title.toLowerCase();
  if (tmdbCache.has(ck)) { const u = tmdbCache.get(ck); return u ? send(u) : fail(); }
  try {
    const q = encodeURIComponent(title.replace(/\s*[\(\[]\d{4}[\)\]].*$/, '').trim());
    const r = await fetchWithTimeout(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&language=pt-BR&query=${q}`, 8000);
    const j = await r.json();
    const path = j && j.results && j.results[0] && j.results[0].poster_path;
    const url = path ? `https://image.tmdb.org/t/p/w342${path}` : '';
    tmdbCache.set(ck, url);
    return url ? send(url) : fail();
  } catch { fail(); }
}

// ─── Provisionamento via agente browser-use (Gradio) ─────────
// SEGREDOS via variável de ambiente — NUNCA hardcode:
//   AGENT_BASE_URL, OPENAI_API_KEY, PANEL_USER, PANEL_PASS, PANEL_HOST
const AGENT_BASE = process.env.AGENT_BASE_URL || 'https://myrl-precisive-nakita.ngrok-free.dev';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

// Monta o array "data" de 45 posições do submit_wrapper (mesmo formato que funciona),
// injetando a chave da OpenAI (env) e a tarefa em data[37].
function buildAgentBody(task) {
  return { data: [
    '', '', null, '',                       // 0-3
    'openai', 'gpt-4o', 0, true, 16000, '', OPENAI_KEY,  // 4-10 (LLM principal)
    'openai', 'gpt-4o', 0, false, 16000, '', OPENAI_KEY, // 11-17 (planner)
    100, 10, 128000, 'function_calling',    // 18-21
    '', '', false, true, false, false, 1280, 1100, // 22-29 (browser)
    '', '', '', '', './tmp/agent_history', './tmp/downloads', // 30-35
    [], task,                                // 36 chat, 37 TAREFA
    null, null, null, null, '', null, null,  // 38-44
  ]};
}

// Chamada Gradio em 2 etapas: POST → event_id → GET stream (resultado)
async function callAgent(task, timeoutMs = 480000) {
  const post = await fetch(`${AGENT_BASE}/gradio_api/call/submit_wrapper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify(buildAgentBody(task)),
  });
  if (!post.ok) throw new Error('agente POST falhou: HTTP ' + post.status);
  const pj = await post.json();
  const eventId = pj.event_id || pj.hash;
  if (!eventId) throw new Error('agente não retornou event_id');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const get = await fetch(`${AGENT_BASE}/gradio_api/call/submit_wrapper/${eventId}`, {
      headers: { 'ngrok-skip-browser-warning': 'true' }, signal: ctrl.signal,
    });
    const raw = await get.text();
    clearTimeout(t);
    return { eventId, raw };
  } catch (e) { clearTimeout(t); throw e; }
}

// Extrai o bloco estruturado RESULTADO_INICIO ... RESULTADO_FIM da saída do agente
function parseAgentResult(raw) {
  const out = {};
  const block = raw.match(/RESULTADO_INICIO([\s\S]*?)RESULTADO_FIM/);
  const body = block ? block[1] : raw;
  body.split(/\\n|\n/).forEach(line => {
    const m = line.match(/^[\s"']*([\w_]+)\s*[:=]\s*(.+?)[\s"']*$/);
    if (m && ['login', 'usuario', 'username', 'senha', 'password', 'vencimento', 'validade', 'url_m3u', 'status'].includes(m[1].toLowerCase())) {
      out[m[1].toLowerCase()] = m[2].trim();
    }
  });
  return out;
}

async function handleProvision(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'use POST' });
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      const { task } = JSON.parse(body || '{}');
      if (!task) return json(res, 400, { error: 'campo "task" obrigatório' });
      if (!OPENAI_KEY) return json(res, 500, { error: 'OPENAI_API_KEY não configurada (defina no ambiente)' });
      console.log('[provision] disparando agente…');
      const { eventId, raw } = await callAgent(task);
      const parsed = parseAgentResult(raw);
      console.log('[provision] resultado:', JSON.stringify(parsed));
      json(res, 200, { ok: true, eventId, parsed });
    } catch (e) {
      console.error('[provision] erro:', e.message);
      json(res, 500, { error: e.message });
    }
  });
}

// ─── RENOVAÇÃO via agente (plano dinâmico) ───────────────────
// Credenciais do painel via env (NUNCA hardcode): PANEL_USER, PANEL_PASS, PANEL_SIGNIN
const PANEL_USER = process.env.PANEL_USER || '';
const PANEL_PASS = process.env.PANEL_PASS || '';
const PANEL_SIGNIN = process.env.PANEL_SIGNIN || 'https://aplicativoz342.click/#/sign-in';

// Mapa: plano pago no app (planKey:duração) → NOME EXATO da assinatura no painel.
// Básico = sem adulto 1 tela | Padrão = sem adulto 2 telas | Premium = com adulto 2 telas.
const PLAN_MAP = {
  // Básico — sem adulto, 1 tela
  'basico:mensal':      'PLANO DE 1 MES 1CRED 1TELAS',
  'basico:trimestral':  'PLANO 3 MESES SEM ADULTO 3CRED 1 TELA',
  'basico:semestral':   '6 MES SEM ADULTO 6 CRED 1TELA',
  'basico:anual':       'PACOTE DE 1 ANO 10 CREDITOS SEM ADULTO 1CRED 1TELA',
  // Padrão — sem adulto, 2 telas
  'padrao:mensal':      '1 MES SEM ADULTO 1 CRED 2TELAS',
  'padrao:trimestral':  '3 MES SEM ADULTO 3 CRED 2TELA',
  'padrao:semestral':   '6 MES SEM ADULTO 6 CRED 2TELA',
  'padrao:anual':       '1 ANO SEM ADULTO 10 CRED 2TELA',
  // Premium — com adulto, 2 telas
  'premium:mensal':     '1 MES COM ADULTO 1 CRED 2TELAS',
  'premium:trimestral': '3 MES COM ADULTO 3 CRED 2TELA',
  'premium:semestral':  '6 MES COM ADULTO 6 CRED 2TELA',
  'premium:anual':      '1 ANO COM ADULTO 10 CRED 2TELA',
};

// Tarefa de renovação robusta: login e plano dinâmicos, retorna bloco RESULTADO (sem Google Doc)
function buildRenewTask(login, planoPainel) {
  return [
    'Você vai RENOVAR um cliente IPTV no painel e retornar o resultado. Faça um passo por vez, confirmando na tela antes do próximo. Após cada ação espere 2-3s; se um elemento não aparecer, espere mais 3s e tente de novo (até 3 vezes). Não invente dados. SEMPRE termine com o bloco RESULTADO.',
    '',
    `PASSO 1 - LOGIN: Abra ${PANEL_SIGNIN} . Espere os campos de usuário e senha aparecerem. No campo usuário digite: ${PANEL_USER} . No campo senha digite: ${PANEL_PASS} . Clique em Entrar e espere o painel carregar (menu lateral visível). Se aparecer um pop-up/anúncio, feche no X e confirme que sumiu.`,
    `PASSO 2 - ENCONTRAR O CLIENTE: Clique na aba "Clientes". Na barra de pesquisa digite exatamente: ${login} . Espere filtrar. Localize o CARD que contém ${login} E também o texto "Alpha server IPTV". Se nenhum card aparecer, termine com status: erro e detalhe: cliente nao encontrado.`,
    `PASSO 3 - RENOVAR: Nesse card clique no botão "Renovar". No pop-up que abrir, selecione exatamente a assinatura: "${planoPainel}". Confirme que a opção correta está selecionada. Clique em "Renovar" e espere a confirmação de sucesso.`,
    'PASSO 4 - CAPTURAR: Clique em "Copiar". Leia o conteúdo copiado (usuario, senha, vencimento). Clique em "Fechar".',
    'PASSO 5 - RETORNAR (OBRIGATÓRIO): termine EXATAMENTE com este bloco, preenchido com os dados reais:',
    'RESULTADO_INICIO',
    `login: ${login}`,
    'usuario: <usuario>',
    'senha: <senha>',
    'vencimento: <data ou vazio>',
    'status: sucesso',
    'RESULTADO_FIM',
    'Se falhar, retorne o mesmo bloco com status: erro e uma linha detalhe: <motivo>.',
  ].join('\n');
}

async function handleRenew(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'use POST' });
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      const { login, plano, planoPainel } = JSON.parse(body || '{}');
      if (!login) return json(res, 400, { error: 'campo "login" obrigatório' });
      if (!OPENAI_KEY) return json(res, 500, { error: 'OPENAI_API_KEY não configurada (env)' });
      if (!PANEL_USER || !PANEL_PASS) return json(res, 500, { error: 'PANEL_USER/PANEL_PASS não configurados (env)' });
      const planoFinal = planoPainel || PLAN_MAP[plano] || plano;
      if (!planoFinal) return json(res, 400, { error: 'plano não informado / não mapeado' });

      console.log(`[renew] login=${login} plano=${planoFinal} — disparando agente…`);
      const { eventId, raw } = await callAgent(buildRenewTask(login, planoFinal));
      const parsed = parseAgentResult(raw);
      console.log('[renew] resultado:', JSON.stringify(parsed));
      json(res, 200, { ok: parsed.status === 'sucesso', login, plano: planoFinal, eventId, parsed });
    } catch (e) {
      console.error('[renew] erro:', e.message);
      json(res, 500, { error: e.message });
    }
  });
}

// ─── helpers ─────────────────────────────────────────────────
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — ' + pathname);
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ─── server ──────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const p = urlObj.pathname;

  if (p === '/api/list') return handleList(req, res, urlObj);
  if (p === '/api/episodes') return handleEpisodes(req, res, urlObj);
  if (p === '/api/info') return handleInfo(req, res, urlObj);
  if (p === '/api/cover') return handleCover(req, res, urlObj);
  if (p === '/api/provision') return handleProvision(req, res);
  if (p === '/api/renew') return handleRenew(req, res);
  if (p === '/api/stream') return handleStream(req, res, urlObj);
  if (p === '/api/ping') return json(res, 200, { ok: true, ts: Date.now() });

  return serveStatic(req, res, p);
});

server.listen(PORT, () => {
  console.log(`\n  TV Fun server rodando em http://localhost:${PORT}`);
  console.log(`  /api/list?url=...  e  /api/stream?url=...  ativos\n`);
});

// Rede de segurança: um proxy de vídeo lida com sockets instáveis;
// nunca derrubar o processo por um erro de stream isolado.
process.on('uncaughtException', (e) => console.error('[uncaught]', e.message));
process.on('unhandledRejection', (e) => console.error('[unhandled]', e?.message || e));
