/* ============================================
   TV Fun IPTV — supabase.js
   Substitui auth.js — todas as páginas devem
   carregar este arquivo + o CDN do Supabase.
   ============================================ */

// ─────────────────────────────────────────────────────────────
//  ⚙️  CONFIGURAÇÃO — cole os valores do seu projeto Supabase
//      Painel → Settings → API
// ─────────────────────────────────────────────────────────────
const TVFUN_SUPABASE_URL = 'https://krcfrqqymytelhkrrfgx.supabase.co';
const TVFUN_SUPABASE_KEY = 'sb_publishable_R40It7qk_NmIxWHK5R8wiw_v-8SCkMl';
// ─────────────────────────────────────────────────────────────

// Detecta se o SDK está disponível
if (typeof window.supabase === 'undefined') {
  console.error('[TV Fun] Supabase SDK não encontrado. Adicione o CDN antes de supabase.js:\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>');
}

// Cliente Supabase
const _sb = window.supabase?.createClient(TVFUN_SUPABASE_URL, TVFUN_SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tvfun_auth' }
});

// ─── Plans config (ancorado: Padrão mensal R$30, anual R$250) ──
const PLANS = {
  basico:  { name: 'Básico',   badge: '🔵', prices: { mensal: 24.90, trimestral: 64.90,  semestral: 119.90, anual: 199.90 }, screens: 1, quality: 'HD',       channels: '50.000+', adult: false },
  padrao:  { name: 'Padrão',   badge: '🟣', prices: { mensal: 30.00, trimestral: 79.90,  semestral: 143.90, anual: 250.00 }, screens: 2, quality: 'Full HD',  channels: '50.000+', adult: false },
  premium: { name: 'Premium',  badge: '🟡', prices: { mensal: 39.90, trimestral: 104.90, semestral: 191.90, anual: 329.90 }, screens: 2, quality: 'Ultra HD', channels: '50.000+', adult: true },
};
const DURATION_MONTHS = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };

// ─── Loading overlay ─────────────────────────────────────────
function _showLoader() {
  if (document.getElementById('__tvfun_loader')) return;
  const d = document.createElement('div');
  d.id = '__tvfun_loader';
  d.innerHTML = `<div style="font-size:28px;font-weight:900;color:#E50914;letter-spacing:-.5px;margin-bottom:16px">TV FUN</div>
    <div style="width:32px;height:32px;border:3px solid rgba(255,255,255,.1);border-top-color:#E50914;border-radius:50%;animation:_s .7s linear infinite"></div>
    <style>@keyframes _s{to{transform:rotate(360deg)}}</style>`;
  d.style.cssText = 'position:fixed;inset:0;background:#0f0f0f;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center';
  document.body.prepend(d);
}
function _hideLoader() { document.getElementById('__tvfun_loader')?.remove(); }

// ─── TVFunDB API pública ──────────────────────────────────────
const TVFunDB = {
  client: _sb,
  PLANS,
  DURATION_MONTHS,

  // ═══════════════ AUTH ═══════════════

  async getUser() {
    if (!_sb) return null;
    const { data: { user } } = await _sb.auth.getUser();
    return user;
  },

  async signIn(email, password) {
    if (!_sb) return { error: 'Supabase não configurado.' };
    const { data, error } = await _sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      const msg = error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error.message;
      return { error: msg };
    }
    return { ok: true, user: data.user };
  },

  async signUp(name, email, password) {
    if (!_sb) return { error: 'Supabase não configurado.' };
    const { data, error } = await _sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) {
      const msg = error.message.includes('already registered') ? 'E-mail já cadastrado.' : error.message;
      return { error: msg };
    }
    // Se confirmação de e-mail está habilitada, session será null
    return { ok: true, user: data.user, needsConfirm: !data.session };
  },

  async signOut() {
    await _sb?.auth.signOut();
    window.location.href = 'login.html';
  },

  async resetPassword(email) {
    if (!_sb) return { error: 'Supabase não configurado.' };
    const { error } = await _sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/streaming/login.html?reset=1`,
    });
    return error ? { error: error.message } : { ok: true };
  },

  // ═══════════════ PERFIL ═══════════════

  async getProfile() {
    const user = await this.getUser();
    if (!user) return null;
    const { data } = await _sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (!data) {
      // cria profile se não existe (trigger pode ter falhado)
      const name = user.user_metadata?.name || user.email.split('@')[0];
      const { data: created } = await _sb.from('profiles')
        .insert({ id: user.id, name }).select().single();
      return created;
    }
    return data;
  },

  async updateProfile(updates) {
    const user = await this.getUser();
    if (!user) return false;
    const { error } = await _sb.from('profiles')
      .upsert({ id: user.id, ...updates, updated_at: new Date().toISOString() });
    return !error;
  },

  // ═══════════════ ASSINATURAS ═══════════════

  async getActiveSubscription() {
    const user = await this.getUser();
    if (!user) return null;
    const { data } = await _sb.from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  },

  async createSubscription(planKey, duration, method, amount) {
    const user = await this.getUser();
    if (!user) return null;
    const months = DURATION_MONTHS[duration] || 1;
    const expiresAt = new Date(Date.now() + months * 30 * 86_400_000).toISOString();

    // Cancela assinaturas anteriores ativas
    await _sb.from('subscriptions')
      .update({ status: 'superseded' })
      .eq('user_id', user.id)
      .eq('status', 'active');

    const { data, error } = await _sb.from('subscriptions').insert({
      user_id: user.id,
      plan: planKey,
      plan_name: PLANS[planKey]?.name,
      duration,
      amount,
      payment_method: method,
      status: 'active',
      expires_at: expiresAt,
    }).select().single();

    return error ? null : data;
  },

  async isPlanActive() {
    const sub = await this.getActiveSubscription();
    return !!sub;
  },

  async cancelActiveSubscription() {
    const user = await this.getUser();
    if (!user) return false;
    const { error } = await _sb.from('subscriptions')
      .update({ status: 'cancelled' }).eq('user_id', user.id).eq('status', 'active');
    return !error;
  },

  // Histórico de assinaturas/pagamentos do usuário (mais recentes primeiro)
  async getSubscriptions(limit = 24) {
    const user = await this.getUser();
    if (!user) return [];
    const { data } = await _sb.from('subscriptions')
      .select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(limit);
    return data || [];
  },

  async planExpiryLabel() {
    const sub = await this.getActiveSubscription();
    if (!sub) return null;
    return new Date(sub.expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  },

  // ═══════════════ CREDENCIAIS IPTV ═══════════════

  // Credencial IPTV ativa do usuário (provisionada pelo agente após pagamento/teste)
  async getActiveCredentials() {
    const user = await this.getUser();
    if (!user) return null;
    const { data } = await _sb.from('iptv_credentials')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'provisioning'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  },

  // Salva um lead capturado pelo chat vendedor da landing (insert anônimo — requer policy na tabela leads)
  async saveLead(lead) {
    if (!lead || !_sb || !lead.whatsapp) return false;
    try {
      const { error } = await _sb.from('leads').insert({
        name: lead.name || null,
        whatsapp: String(lead.whatsapp),
        country: lead.country || null,
        interest: lead.interest || null,
        source: 'chat_landing',
      });
      return !error;
    } catch { return false; }
  },

  // Monta a URL m3u a partir do usuário/senha do painel (host padrão = alphapublic.top)
  buildM3uUrl(username, password, host = 'alphapublic.top') {
    return `http://${host}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=mpegts`;
  },

  // Retorna a m3u pronta do usuário (do campo salvo, ou montada do user/senha)
  async getMyM3uUrl() {
    const c = await this.getActiveCredentials();
    if (!c) return null;
    if (c.m3u_url) return c.m3u_url;
    if (c.iptv_username && c.iptv_password) return this.buildM3uUrl(c.iptv_username, c.iptv_password, c.panel_host || 'alphapublic.top');
    return null;
  },

  // Teste é ÚNICO por usuário — verifica se já existe um teste (mesmo expirado)
  async hasUsedTrial() {
    const user = await this.getUser();
    if (!user) return false;
    const { data } = await _sb.from('iptv_credentials')
      .select('id').eq('user_id', user.id).eq('is_trial', true).limit(1).maybeSingle();
    return !!data;
  },

  // Qualquer credencial (teste ou paga), independente de status
  async getAnyCredential() {
    const user = await this.getUser();
    if (!user) return null;
    const { data } = await _sb.from('iptv_credentials')
      .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    return data;
  },

  // ═══════════════ FAVORITOS ═══════════════

  async getFavorites() {
    const user = await this.getUser();
    if (!user) return [];
    const { data } = await _sb.from('favorites')
      .select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    return data || [];
  },

  async getFavoriteIds() {
    const favs = await this.getFavorites();
    return new Set(favs.map(f => f.channel_id));
  },

  async toggleFavorite(channel) {
    const user = await this.getUser();
    if (!user) return false;
    const cid = String(channel.id || channel.name);
    const { data: existing } = await _sb.from('favorites')
      .select('id').eq('user_id', user.id).eq('channel_id', cid).maybeSingle();
    if (existing) {
      await _sb.from('favorites').delete().eq('id', existing.id);
      return false; // removido
    }
    await _sb.from('favorites').insert({
      user_id: user.id,
      channel_id: cid,
      channel_name: channel.name,
      channel_logo: channel.logo || '',
      channel_group: channel.group || '',
      channel_url: channel.url,
    });
    return true; // adicionado
  },

  // ═══════════════ HISTÓRICO ═══════════════

  async addToHistory(channel) {
    const user = await this.getUser();
    if (!user) return;
    const cid = String(channel.id || channel.name);
    await _sb.from('watch_history').upsert({
      user_id: user.id,
      channel_id: cid,
      channel_name: channel.name,
      channel_logo: channel.logo || '',
      channel_group: channel.group || '',
      channel_url: channel.url,
      watched_at: new Date().toISOString(),
    }, { onConflict: 'user_id,channel_id' });
  },

  async getHistory(limit = 12) {
    const user = await this.getUser();
    if (!user) return [];
    const { data } = await _sb.from('watch_history')
      .select('*').eq('user_id', user.id)
      .order('watched_at', { ascending: false }).limit(limit);
    return (data || []).map(r => ({
      id: r.channel_id, name: r.channel_name,
      logo: r.channel_logo, group: r.channel_group, url: r.channel_url,
    }));
  },

  // ═══════════════ LISTAS M3U ═══════════════

  async getLists() {
    const user = await this.getUser();
    if (!user) return [];
    const { data } = await _sb.from('m3u_lists')
      .select('*').eq('user_id', user.id).order('last_used', { ascending: false });
    return data || [];
  },

  async saveList(name, url, count) {
    const user = await this.getUser();
    if (!user) return;
    const { data: existing } = await _sb.from('m3u_lists')
      .select('id').eq('user_id', user.id).eq('url', url || '').maybeSingle();
    if (existing) {
      await _sb.from('m3u_lists')
        .update({ name, channel_count: count, last_used: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await _sb.from('m3u_lists')
        .insert({ user_id: user.id, name, url: url || '', channel_count: count });
    }
  },

  async deleteList(listId) {
    await _sb.from('m3u_lists').delete().eq('id', listId);
  },

  // ═══════════════ AUTH GUARD ═══════════════

  /** Mostra loader, verifica sessão, redireciona se não logado */
  async requireAuth({ requirePlan = false } = {}) {
    _showLoader();
    const user = await this.getUser();
    if (!user) { window.location.href = 'login.html'; return null; }
    if (requirePlan) {
      const sub = await this.getActiveSubscription();
      if (!sub) { window.location.href = 'planos.html?action=new'; return null; }
    }
    _hideLoader();
    return user;
  },
};

// Expõe globalmente (retrocompatibilidade)
window.TVFunDB = TVFunDB;
