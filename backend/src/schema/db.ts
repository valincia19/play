import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../config/env'
import * as userSchema from './user.schema'
import * as billingSchema from './billing.schema'
import * as videoSchema from './video.schema'
import * as planSchema from './plan.schema'
import * as folderSchema from './folder.schema'
import * as storageSchema from './storage.schema'
import * as auditSchema from './audit.schema'
import * as blogSchema from './blog.schema'
import * as adSchema from './ad_settings.schema'
import * as domainSchema from './domain.schema'

const schema = { ...userSchema, ...billingSchema, ...videoSchema, ...planSchema, ...folderSchema, ...storageSchema, ...auditSchema, ...blogSchema, ...adSchema, ...domainSchema }

// Lazy-init: connection is created on first access, not at module load time.
// This prevents "Config not loaded" errors when Bun's --watch re-evaluates the module
// graph before the entry point calls loadConfig().
let _db: PostgresJsDatabase<typeof schema> | null = null

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    const client = postgres(env.databaseUrl, { max: 10 })
    _db = drizzle(client, { schema })
  }
  return _db
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    return (getDb() as any)[prop]
  }
})

export type Database = typeof db
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]