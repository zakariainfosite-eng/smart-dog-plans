
-- Enums
CREATE TYPE public.gender_type AS ENUM ('male', 'female');
CREATE TYPE public.shift_type AS ENUM ('day', 'night');
CREATE TYPE public.dog_specialty AS ENUM ('narcotics', 'explosives');
CREATE TYPE public.dog_status AS ENUM ('available', 'sick', 'heat');
CREATE TYPE public.exclusion_type AS ENUM (
  'absence','sickness','administrative_leave','special_leave','dog_sick','female_dog_heat'
);

-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. sections
CREATE TABLE public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  shift_type public.shift_type NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_sections_updated_at BEFORE UPDATE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sections_active ON public.sections(active);

-- 2. dogs
CREATE TABLE public.dogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gender public.gender_type NOT NULL,
  specialty public.dog_specialty NOT NULL,
  status public.dog_status NOT NULL DEFAULT 'available',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dogs TO authenticated;
GRANT ALL ON public.dogs TO service_role;
ALTER TABLE public.dogs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_dogs_updated_at BEFORE UPDATE ON public.dogs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dogs_active ON public.dogs(active);
CREATE INDEX idx_dogs_status ON public.dogs(status);
CREATE INDEX idx_dogs_specialty ON public.dogs(specialty);

-- 3. agents  (one-to-one with dogs via unique dog_id)
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  professional_number TEXT NOT NULL UNIQUE,
  grade TEXT NOT NULL,
  gender public.gender_type NOT NULL,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  dog_id UUID UNIQUE REFERENCES public.dogs(id) ON DELETE SET NULL,
  is_section_chief BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_agents_updated_at BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_agents_section ON public.agents(section_id);
CREATE INDEX idx_agents_active ON public.agents(active);

-- 4. checkpoints
CREATE TABLE public.checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  night_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkpoints TO authenticated;
GRANT ALL ON public.checkpoints TO service_role;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_checkpoints_updated_at BEFORE UPDATE ON public.checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_checkpoints_active ON public.checkpoints(active);

-- 5. checkpoint_posts
CREATE TABLE public.checkpoint_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id UUID NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
  specialty_required public.dog_specialty NOT NULL,
  required_agents INT NOT NULL DEFAULT 1 CHECK (required_agents > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkpoint_posts TO authenticated;
GRANT ALL ON public.checkpoint_posts TO service_role;
ALTER TABLE public.checkpoint_posts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_checkpoint_posts_updated_at BEFORE UPDATE ON public.checkpoint_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_checkpoint_posts_checkpoint ON public.checkpoint_posts(checkpoint_id);
CREATE INDEX idx_checkpoint_posts_specialty ON public.checkpoint_posts(specialty_required);

-- 6. agent_exclusions
CREATE TABLE public.agent_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  exclusion_type public.exclusion_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_exclusions TO authenticated;
GRANT ALL ON public.agent_exclusions TO service_role;
ALTER TABLE public.agent_exclusions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_agent_exclusions_updated_at BEFORE UPDATE ON public.agent_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_agent_exclusions_agent ON public.agent_exclusions(agent_id);
CREATE INDEX idx_agent_exclusions_dates ON public.agent_exclusions(start_date, end_date);

-- 7. planning
CREATE TABLE public.planning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_date DATE NOT NULL,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE RESTRICT,
  shift public.shift_type NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (planning_date, section_id, shift)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning TO authenticated;
GRANT ALL ON public.planning TO service_role;
ALTER TABLE public.planning ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_planning_updated_at BEFORE UPDATE ON public.planning
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_planning_date ON public.planning(planning_date);
CREATE INDEX idx_planning_section ON public.planning(section_id);

-- 8. planning_assignments
CREATE TABLE public.planning_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id UUID NOT NULL REFERENCES public.planning(id) ON DELETE CASCADE,
  checkpoint_post_id UUID NOT NULL REFERENCES public.checkpoint_posts(id) ON DELETE RESTRICT,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  dog_id UUID REFERENCES public.dogs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_assignments TO authenticated;
GRANT ALL ON public.planning_assignments TO service_role;
ALTER TABLE public.planning_assignments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_planning_assignments_updated_at BEFORE UPDATE ON public.planning_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_pa_planning ON public.planning_assignments(planning_id);
CREATE INDEX idx_pa_post ON public.planning_assignments(checkpoint_post_id);
CREATE INDEX idx_pa_agent ON public.planning_assignments(agent_id);
CREATE INDEX idx_pa_dog ON public.planning_assignments(dog_id);

-- 9. rotation_history
CREATE TABLE public.rotation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  checkpoint_post_id UUID NOT NULL REFERENCES public.checkpoint_posts(id) ON DELETE CASCADE,
  planning_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotation_history TO authenticated;
GRANT ALL ON public.rotation_history TO service_role;
ALTER TABLE public.rotation_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rh_agent ON public.rotation_history(agent_id);
CREATE INDEX idx_rh_post ON public.rotation_history(checkpoint_post_id);
CREATE INDEX idx_rh_date ON public.rotation_history(planning_date);

-- 10. application_settings
CREATE TABLE public.application_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_settings TO authenticated;
GRANT ALL ON public.application_settings TO service_role;
ALTER TABLE public.application_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_app_settings_updated_at BEFORE UPDATE ON public.application_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
