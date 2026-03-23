#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'init') {
    await init(args.slice(1));
  } else {
    console.log(`
@openclaw/become — Agents get smarter together.

Commands:
  become init              Initialize become tables
  become init --supabase   Force Supabase mode
  become init --sqlite     Force local SQLite mode

Options:
  --help                   Show this help
`);
  }
}

async function init(args: string[]) {
  const forceSupabase = args.includes('--supabase');
  const forceSqlite = args.includes('--sqlite');

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;

  const useSupabase = forceSupabase || (!forceSqlite && supabaseUrl && supabaseKey);

  if (useSupabase) {
    if (!supabaseUrl || !supabaseKey) {
      console.error('Error: SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set.');
      process.exit(1);
    }

    console.log('Initializing become tables in Supabase...');

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Read migration SQL
      const migrationPath = join(__dirname, '..', 'migrations', '001_initial.sql');
      let sql: string;
      try {
        sql = readFileSync(migrationPath, 'utf-8');
      } catch {
        // Fallback for bundled dist
        const altPath = join(__dirname, '..', '..', 'migrations', '001_initial.sql');
        sql = readFileSync(altPath, 'utf-8');
      }

      const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();
      if (error) {
        // Try direct SQL if RPC not available
        console.log('Note: Run the migration SQL manually if RPC is not available.');
        console.log(`Migration file: migrations/001_initial.sql`);
      } else {
        console.log('Done! Tables created successfully.');
      }
    } catch (err: any) {
      console.error('Failed to initialize:', err.message);
      console.log('\nYou can run the migration manually:');
      console.log('  migrations/001_initial.sql');
      process.exit(1);
    }
  } else {
    console.log('No Supabase credentials found. Using in-memory store for now.');
    console.log('Set SUPABASE_URL and SUPABASE_KEY to use Supabase, or use --sqlite for local storage.');
  }

  console.log(`
Quickstart:

  import { Become, MemoryStore } from '@openclaw/become';

  const become = new Become({ store: new MemoryStore() });

  // Register a skill
  await become.skills.upsert('agent-1', { name: 'debugging', category: 'coding' });

  // Score it
  const score = become.scorer.computeFullScore('debugging', {
    artifact_count: 5, total_reactions: 12, recent_reaction_avg: 4,
    older_reaction_avg: 2, unique_types: 3, collab_count: 1,
    peer_reviews_given: 0, peer_reviews_received: 1,
    follower_count: 2, teaching_events: 0,
  });

  console.log(score.dreyfus_stage); // 'beginner'
`);
}

main().catch(console.error);
