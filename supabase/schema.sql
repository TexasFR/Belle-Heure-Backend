-- ================================================================
-- BELLE HEURE — Schéma Supabase
-- Copiez dans Supabase Dashboard → SQL Editor → New query → Run
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── profiles (étend auth.users) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name  TEXT NOT NULL DEFAULT '',
  phone      TEXT DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── services ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.services (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '✨',
  description TEXT DEFAULT '',
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration    INTEGER NOT NULL DEFAULT 30,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── schedule ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schedule (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week INTEGER NOT NULL UNIQUE CHECK (day_of_week BETWEEN 0 AND 6),
  is_open     BOOLEAN NOT NULL DEFAULT true,
  open_time   TIME NOT NULL DEFAULT '09:00',
  close_time  TIME NOT NULL DEFAULT '19:00'
);

-- ── blocked_dates ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blocked_dates (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date       DATE NOT NULL UNIQUE,
  reason     TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── slot_config ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.slot_config (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slot_duration INTEGER NOT NULL DEFAULT 30,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── appointments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointments (
  id                TEXT PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  service_id        UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name      TEXT NOT NULL,
  service_icon      TEXT NOT NULL DEFAULT '✨',
  service_price     NUMERIC(10,2) NOT NULL,
  appointment_date  DATE NOT NULL,
  appointment_slot  TIME NOT NULL,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT NOT NULL,
  notes             TEXT DEFAULT '',
  payment_method    TEXT NOT NULL DEFAULT 'stripe' CHECK (payment_method IN ('stripe','on_site')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  stripe_payment_id TEXT DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── gallery ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gallery (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  storage_path TEXT DEFAULT NULL,
  public_url   TEXT DEFAULT NULL,
  caption      TEXT DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'general',
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── settings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- DONNÉES PAR DÉFAUT
-- ================================================================

INSERT INTO public.schedule (day_of_week, is_open, open_time, close_time) VALUES
  (0, false, '09:00', '19:00'),
  (1, true,  '09:00', '19:00'),
  (2, true,  '09:00', '19:00'),
  (3, true,  '09:00', '19:00'),
  (4, true,  '09:00', '19:00'),
  (5, true,  '09:00', '19:00'),
  (6, true,  '09:00', '14:00')
ON CONFLICT (day_of_week) DO NOTHING;

INSERT INTO public.slot_config (slot_duration) SELECT 30 WHERE NOT EXISTS (SELECT 1 FROM public.slot_config);

INSERT INTO public.services (name, icon, description, price, duration, active, sort_order) VALUES
  ('Épilation sourcils','🪮','Mise en forme et épilation précise des sourcils.',15,15,true,1),
  ('Soin du visage','✨','Nettoyage en profondeur, hydratation et luminosité.',55,60,true,2),
  ('Manucure','💅','Soin complet des mains et pose de vernis.',35,45,true,3),
  ('Pédicure','🦶','Soin complet des pieds, bain et vernis.',45,60,true,4),
  ('Maquillage','💄','Maquillage professionnel pour toutes occasions.',65,60,true,5),
  ('Épilation corps','🌿','Épilation à la cire douce corps entier ou zone.',30,45,true,6)
ON CONFLICT DO NOTHING;

INSERT INTO public.settings (key, value) VALUES
  ('salon_name',    'Belle Heure'),
  ('salon_email',   'contact@belleheure.fr'),
  ('salon_address', '12 Rue de la Paix, 75001 Paris'),
  ('salon_phone',   '01 23 45 67 89')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_config  ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_self"   ON public.profiles FOR ALL USING (auth.uid() = id);
-- Services: public read
CREATE POLICY "services_read"   ON public.services FOR SELECT USING (true);
CREATE POLICY "services_admin"  ON public.services FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'));
-- Schedule: public read
CREATE POLICY "schedule_read"   ON public.schedule FOR SELECT USING (true);
CREATE POLICY "schedule_admin"  ON public.schedule FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'));
CREATE POLICY "blocked_read"    ON public.blocked_dates FOR SELECT USING (true);
CREATE POLICY "blocked_admin"   ON public.blocked_dates FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'));
CREATE POLICY "slotcfg_read"    ON public.slot_config FOR SELECT USING (true);
CREATE POLICY "slotcfg_admin"   ON public.slot_config FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'));
-- Appointments
CREATE POLICY "appt_read"       ON public.appointments FOR SELECT USING (auth.uid()=user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'));
CREATE POLICY "appt_insert"     ON public.appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "appt_update"     ON public.appointments FOR UPDATE USING (auth.uid()=user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'));
-- Gallery: public read
CREATE POLICY "gallery_read"    ON public.gallery FOR SELECT USING (true);
CREATE POLICY "gallery_admin"   ON public.gallery FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'));
-- Settings: public read
CREATE POLICY "settings_read"   ON public.settings FOR SELECT USING (true);
CREATE POLICY "settings_admin"  ON public.settings FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'));

-- ================================================================
-- TRIGGERS
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, phone)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name',''),
    COALESCE(NEW.raw_user_meta_data->>'last_name',''),
    COALESCE(NEW.raw_user_meta_data->>'phone',''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appts_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================================
-- STORAGE: créez un bucket "gallery" en mode PUBLIC
-- Supabase Dashboard → Storage → New Bucket → "gallery" → Public
-- ================================================================

-- ================================================================
-- CRÉER UN ADMIN (après inscription sur le site):
-- UPDATE public.profiles SET role = 'admin' WHERE id = 'votre-uuid';
-- ================================================================
