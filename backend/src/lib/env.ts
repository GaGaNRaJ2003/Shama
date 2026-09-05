/**
 * Environment loading — must be imported before anything that reads process.env.
 *
 * ES module imports are evaluated depth-first *before* any statement in the
 * importing module runs. So calling dotenv.config() in server.ts was too late:
 * lib/supabase.ts had already been evaluated and had already read
 * process.env.SUPABASE_URL as undefined. Putting the load in its own module and
 * importing it first is what makes the ordering explicit and reliable.
 *
 * The credentials live in the repo-root .env, but every documented start is
 * `cd backend && npm run dev`, so a bare dotenv.config() (which resolves
 * cwd/.env) finds nothing.
 */

import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// Repo root first, then a backend-local .env if one exists (it wins).
dotenv.config({ path: path.resolve(here, '../../../.env') })
dotenv.config()

export const ENV_LOADED = true
