import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
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

const connectionString = process.env.DATABASE_URL!

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const schema = { ...userSchema, ...billingSchema, ...videoSchema, ...planSchema, ...folderSchema, ...storageSchema, ...auditSchema, ...blogSchema, ...adSchema, ...domainSchema }
const client = postgres(connectionString, { max: 10 })
export const db: PostgresJsDatabase<typeof schema> = drizzle(client, { schema })

export type Database = typeof db
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]