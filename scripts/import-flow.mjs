#!/usr/bin/env node
// The CLI twin of the import endpoint.
//
// Same file, same validation, same writes - for the case where there is no
// browser session to hand, which is exactly what configuring a live site from a
// laptop looks like. It deliberately runs the SAME code as the button rather
// than its own copy, so the two cannot disagree about what a file means.
//
//   node scripts/import-flow.mjs my-flow.json --dry-run
//   node scripts/import-flow.mjs my-flow.json
//
// Needs DATABASE_URL in the environment, pointing at the site being configured.
// Read the dry run first. Always.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const file = args.find((arg) => !arg.startsWith('--'))

if (!file) {
  console.error('Usage: node scripts/import-flow.mjs <file.json> [--dry-run]')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Point it at the site you mean to configure, and check twice which one that is.')
  process.exit(1)
}

// The module tree uses the app's own `@/` alias and TypeScript sources, so this
// runs through the same loader the rest of the repo's scripts use. Run from the
// core checkout that has this module installed under modules/.
register('tsx/esm', pathToFileURL('./'))

const { FlowFileSchema, importFlowFile, validateFlowFile } = await import(
  '../lib/import-export.ts'
)

const raw = readFileSync(resolve(file), 'utf8')
let parsed
try {
  parsed = FlowFileSchema.parse(JSON.parse(raw))
} catch (error) {
  console.error('That file is not a flow this version understands:')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const report = dryRun ? await validateFlowFile(parsed) : (await importFlowFile(parsed)).report

if (!report.ok) {
  console.error(`\n${report.problems.length} problem(s) - nothing was written:\n`)
  for (const problem of report.problems) console.error(`  - ${problem.where} ${problem.problem}`)
  process.exit(1)
}

const { nodes, questions, notes, nodesToDelete } = report.counts
console.log(
  `${dryRun ? 'Would apply' : 'Applied'}: ${nodes} choices, ${questions} questions, ${notes} explanations.` +
    (nodesToDelete > 0 ? ` ${nodesToDelete} existing choice(s) not named by this file ${dryRun ? 'would be' : 'were'} removed.` : ''),
)
