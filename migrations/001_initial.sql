-- @openclaw/become — initial schema
-- Run with: npx become init --supabase

CREATE TABLE IF NOT EXISTS become_skills (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL,
  name text NOT NULL,
  category text DEFAULT 'general',
  score integer DEFAULT 0,
  blooms_level text DEFAULT 'remember',
  dreyfus_stage text DEFAULT 'novice',
  evidence jsonb DEFAULT '{}',
  learned_from jsonb DEFAULT '[]',
  content text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, name)
);

CREATE TABLE IF NOT EXISTS become_skill_catalog (
  skill text PRIMARY KEY,
  category text DEFAULT 'general',
  description text,
  status text DEFAULT 'community',
  adopter_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS become_score_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL,
  skill text NOT NULL,
  score integer NOT NULL,
  blooms_level text NOT NULL,
  dreyfus_stage text NOT NULL,
  evidence jsonb DEFAULT '{}',
  computed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS become_reflections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id text NOT NULL,
  skill text NOT NULL,
  artifact_id text,
  reflection text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS become_milestones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL,
  milestone_type text NOT NULL,
  threshold integer,
  skill text,
  evidence_id text,
  achieved_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, milestone_type, COALESCE(skill, ''))
);

CREATE TABLE IF NOT EXISTS become_peer_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reviewer_agent_id text NOT NULL,
  submission_agent_id text NOT NULL,
  submission_id text NOT NULL,
  skill text,
  verdict text NOT NULL,
  overall_assessment text NOT NULL,
  strengths jsonb DEFAULT '[]',
  weaknesses jsonb DEFAULT '[]',
  suggestions jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS become_learning_edges (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_agent text NOT NULL,
  to_agent text NOT NULL,
  skill text NOT NULL,
  event_type text NOT NULL,
  score_delta integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS become_cultural_norms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  significance integer DEFAULT 1,
  evidence jsonb DEFAULT '[]',
  adopter_count integer DEFAULT 0,
  first_observed_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS become_conversation_scores (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL,
  session_id text,
  quality smallint NOT NULL,
  confidence real NOT NULL,
  skill_signals jsonb DEFAULT '[]',
  failure_patterns jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS become_reputation (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL,
  amount integer NOT NULL,
  type text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_become_skills_agent ON become_skills(agent_id);
CREATE INDEX IF NOT EXISTS idx_become_skills_name ON become_skills(name);
CREATE INDEX IF NOT EXISTS idx_become_history_agent_skill ON become_score_history(agent_id, skill, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_become_reflections_agent ON become_reflections(agent_id, skill, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_become_milestones_agent ON become_milestones(agent_id);
CREATE INDEX IF NOT EXISTS idx_become_peer_reviews_submission ON become_peer_reviews(submission_agent_id);
CREATE INDEX IF NOT EXISTS idx_become_peer_reviews_reviewer ON become_peer_reviews(reviewer_agent_id);
CREATE INDEX IF NOT EXISTS idx_become_learning_edges_to ON become_learning_edges(to_agent, skill);
CREATE INDEX IF NOT EXISTS idx_become_learning_edges_from ON become_learning_edges(from_agent);
CREATE INDEX IF NOT EXISTS idx_become_conversation_scores_agent ON become_conversation_scores(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_become_reputation_agent ON become_reputation(agent_id);
