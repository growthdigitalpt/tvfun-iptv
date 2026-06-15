-- ============================================================
--  TV Fun IPTV — Supabase Schema
--  Execute no SQL Editor: Painel → SQL Editor → New query
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- TABELA: profiles
-- Dados extras do usuário (complementa auth.users)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name       TEXT,
  phone      TEXT,
  country    TEXT DEFAULT 'BR',
  bio        TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- TABELA: subscriptions
-- Assinaturas/planos dos usuários
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan           TEXT NOT NULL,                       -- 'basico' | 'padrao' | 'premium'
  plan_name      TEXT,
  duration       TEXT NOT NULL,                       -- 'mensal' | 'trimestral' | 'semestral' | 'anual'
  amount         NUMERIC(10,2),
  payment_method TEXT,                                -- 'pix' | 'card' | 'boleto'
  status         TEXT DEFAULT 'active'
    CHECK (status IN ('active','expired','cancelled','superseded','pending')),
  starts_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- TABELA: favorites
-- Canais favoritos por usuário
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.favorites (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  channel_id    TEXT NOT NULL,
  channel_name  TEXT,
  channel_logo  TEXT,
  channel_group TEXT,
  channel_url   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, channel_id)
);

-- ────────────────────────────────────────────────────────────
-- TABELA: watch_history
-- Histórico de canais assistidos (um registro por canal)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.watch_history (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  channel_id    TEXT NOT NULL,
  channel_name  TEXT,
  channel_logo  TEXT,
  channel_group TEXT,
  channel_url   TEXT,
  watched_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, channel_id)
);

-- ────────────────────────────────────────────────────────────
-- TABELA: m3u_lists
-- Listas M3U salvas pelo usuário
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.m3u_lists (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  url           TEXT DEFAULT '',
  channel_count INTEGER DEFAULT 0,
  last_used     TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- TABELA: iptv_credentials
-- Credenciais IPTV provisionadas por usuário (gatilho de pagamento)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.iptv_credentials (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email          TEXT,                          -- identificador do cliente (espelha auth.users.email)
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  panel_host     TEXT,                          -- host do painel/stream (ex: alphapublic.top)
  iptv_username  TEXT,                          -- usuário interno do painel
  iptv_password  TEXT,                          -- senha interna do painel
  m3u_url        TEXT,                          -- URL pessoal get.php (app carrega sozinho)
  panel_line_id  TEXT,                          -- id da linha no painel (gerenciar/renovar)
  max_connections INTEGER DEFAULT 2,
  is_trial       BOOLEAN DEFAULT TRUE,          -- teste único vs assinatura paga
  status         TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','provisioning','active','expired','suspended','error')),
  expires_at     TIMESTAMPTZ,
  provisioned_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.iptv_credentials ENABLE ROW LEVEL SECURITY;
-- usuário lê só as próprias credenciais; escrita fica a cargo do backend (service_role)
DROP POLICY IF EXISTS "iptv_cred_read_self" ON public.iptv_credentials;
CREATE POLICY "iptv_cred_read_self" ON public.iptv_credentials
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_iptv_cred_user ON public.iptv_credentials(user_id, status);
-- Teste é ÚNICO por usuário: o banco impede um 2º teste (rede de segurança além da checagem no app)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_per_user ON public.iptv_credentials(user_id) WHERE is_trial = true;

-- ════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Cada usuário acessa apenas seus próprios dados
-- ════════════════════════════════════════════
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m3u_lists     ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- subscriptions
CREATE POLICY "subscriptions_self" ON public.subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- favorites
CREATE POLICY "favorites_self" ON public.favorites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- watch_history
CREATE POLICY "watch_history_self" ON public.watch_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- m3u_lists
CREATE POLICY "m3u_lists_self" ON public.m3u_lists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ════════════════════════════════════════════
-- TRIGGER: cria profile automaticamente ao registrar
-- ════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ════════════════════════════════════════════
-- ÍNDICES para performance
-- ════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_subs_user_status
  ON public.subscriptions(user_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_favs_user
  ON public.favorites(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_user_watched
  ON public.watch_history(user_id, watched_at DESC);

CREATE INDEX IF NOT EXISTS idx_lists_user
  ON public.m3u_lists(user_id, last_used DESC);

-- ════════════════════════════════════════════
-- VIEW: active_subscriptions (opcional)
-- ════════════════════════════════════════════
CREATE OR REPLACE VIEW public.active_subscriptions AS
SELECT s.*, p.name AS user_name, p.phone
FROM public.subscriptions s
JOIN public.profiles p ON p.id = s.user_id
WHERE s.status = 'active' AND s.expires_at > NOW();

-- ════════════════════════════════════════════
-- CONFIGURAÇÕES RECOMENDADAS no painel Supabase
-- ════════════════════════════════════════════
-- 1. Authentication → Email → Disable "Confirm email"
--    (para desenvolvimento; reative em produção)
--
-- 2. Authentication → URL Configuration → Site URL
--    Ex: http://localhost:3132
--
-- 3. Authentication → URL Configuration → Redirect URLs
--    Ex: http://localhost:3132/streaming/login.html
-- ════════════════════════════════════════════
