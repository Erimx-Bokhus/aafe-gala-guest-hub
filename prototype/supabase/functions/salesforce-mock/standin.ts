// DEMO ONLY: the stand-in org's three calls (salesforce-mock) as plain functions over its database functions
// (database/demo_salesforce.sql). salesforce-push uses them directly when SALESFORCE_BASE_URL is this project's own
// salesforce-mock: Supabase lets one chain of function-to-function calls make only 30 requests a minute, and a full
// gala's lookups need more (supabase.com/docs/guides/functions/recursive-functions). A real org is reached over HTTP.
// scripts/test-salesforce.mts pushes through these same functions.
import type { PushPorts, SfAnswer } from '../_shared/salesforce.ts'
import { parseSoql } from './soql.ts'

/** Calls one database function by name with named arguments, and returns its result (throws on error). */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>

export const standInPorts = (rpc: Rpc): PushPorts => ({
  query: async (soql) => {
    const q = parseSoql(soql)
    return await rpc('demo_salesforce_query', { p_sobject: q.sobject, p_fields: q.fields, p_any: q.any, p_conds: q.conds }) as Record<string, unknown>[]
  },
  upsert: async (sobject, records) => await rpc('demo_salesforce_upsert', { p_sobject: sobject, p_records: records }) as SfAnswer[],
  save: async (op, records) => await rpc('demo_salesforce_save', { p_op: op, p_records: records }) as SfAnswer[],
})

/** Is this Salesforce address the stand-in in this same project (projectUrl: SUPABASE_URL)? */
export const isOwnStandIn = (base: string, projectUrl: string) =>
  Boolean(projectUrl) && base.replace(/\/+$/, '') === `${projectUrl.replace(/\/+$/, '')}/functions/v1/salesforce-mock`
