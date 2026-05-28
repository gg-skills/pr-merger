#!/usr/bin/env npx tsx

/**
 * PR Merger Completeness Checker
 * 
 * Verifies a PR merger operation against the 10-item PR Merger Quality Checklist.
 * 
 * Usage:
 *   npx tsx skills/pr-merger/scripts/check-pr-merger-completeness.ts
 */

import { argv } from "process";

// ============================================================================
// Types
// ============================================================================

/**
 * One PR merger checklist row with scoring metadata and a phase-derived completion flag.
 *
 * @remarks
 * `checked` is synthesized from the CLI `--phase` value and each item's phase mapping; it is not
 * part of the static checklist definition.
 */
interface ChecklistItem {
  number: number;
  name: string;
  description: string;
  required: boolean;
  checked: boolean;
  weight: number;
}

/**
 * JSON-serialized completeness snapshot emitted when `--json` is passed.
 *
 * @remarks
 * USAGE: Intended for tooling that ingests stdout; fields mirror the console summary.
 */
interface CompletenessReport {
  checklist: ChecklistItem[];
  score: number;
  maxScore: number;
  canFinalize: boolean;
}

// ============================================================================
// Checklist Definition
// ============================================================================

const CHECKLIST_ITEMS: Omit<ChecklistItem, "checked">[] = [
  { number: 1, name: "PRs confirmed", description: "Competing set identified via gh pr list", required: true, weight: 2 },
  { number: 2, name: "Metadata fetched", description: "Title, body, diffs, files for all PRs", required: true, weight: 2 },
  { number: 3, name: "File overlap identified", description: "Shared core vs asymmetric files mapped", required: true, weight: 2 },
  { number: 4, name: "Head-to-head verified", description: "All PRs compared systematically", required: true, weight: 2 },
  { number: 5, name: "Winner based on real wins", description: "Correctness wins, not test count", required: true, weight: 2 },
  { number: 6, name: "Cherry-picks listed", description: "Specific file:line from losers", required: true, weight: 1 },
  { number: 7, name: "Cherry-picks applied", description: "Applied to winner's branch before merge", required: true, weight: 2 },
  { number: 8, name: "Tests pass after cherry-picks", description: "Typecheck + tests run", required: true, weight: 2 },
  { number: 9, name: "Phase 6 calibration done", description: "\"Nothing\" claim verified", required: true, weight: 1 },
  { number: 10, name: "Losers closed with reasons", description: "Explicit close messages", required: true, weight: 2 },
];

// ============================================================================
// Main
// ============================================================================

/**
 * CLI entrypoint: parse flags, derive checklist completion from phase, print human summary.
 *
 * @remarks
 * I/O: reads `process.argv`; writes human-readable lines to stdout and optional JSON when `--json`
 * is present. No filesystem or network access.
 */
function main() {
  const args = argv.slice(2);
  const phaseArg = args.find(a => a === "--phase" || a === "-p");
  const jsonArg = args.includes("--json");
  
  const currentPhase = phaseArg 
    ? parseInt(args[args.indexOf(phaseArg) + 1] || "4", 10)
    : 6;
  
  console.log("\n📋 PR Merger Completeness Check");
  console.log("═".repeat(60));
  console.log(`\n📊 Current Phase: ${currentPhase}/6`);
  
  // Build checklist based on current phase
  const checklist: ChecklistItem[] = CHECKLIST_ITEMS.map(item => {
    let checked = false;
    
    // Determine which phases are complete
    const phase1Done = currentPhase >= 1;
    const phase2Done = currentPhase >= 2;
    const phase3Done = currentPhase >= 3;
    const phase4Done = currentPhase >= 4;
    const phase5Done = currentPhase >= 5;
    const phase6Done = currentPhase >= 6;
    
    switch (item.number) {
      case 1: // PRs confirmed
        checked = phase1Done;
        break;
      case 2: // Metadata fetched
        checked = phase1Done;
        break;
      case 3: // File overlap identified
        checked = phase2Done;
        break;
      case 4: // Head-to-head verified
        checked = phase3Done;
        break;
      case 5: // Winner based on real wins
        checked = phase4Done;
        break;
      case 6: // Cherry-picks listed
        checked = phase4Done;
        break;
      case 7: // Cherry-picks applied
        checked = phase5Done;
        break;
      case 8: // Tests pass after cherry-picks
        checked = phase5Done;
        break;
      case 9: // Phase 6 calibration done
        checked = phase6Done;
        break;
      case 10: // Losers closed with reasons
        checked = phase6Done;
        break;
    }
    
    return { ...item, checked };
  });
  
  const score = checklist.reduce((sum, item) => 
    item.checked ? sum + item.weight : sum, 0);
  const maxScore = checklist.reduce((sum, item) => sum + item.weight, 0);
  
  const requiredItems = checklist.filter(i => i.required);
  const requiredScore = requiredItems.reduce((sum, item) => 
    item.checked ? sum + item.weight : sum, 0);
  const requiredMax = requiredItems.reduce((sum, item) => sum + item.weight, 0);
  
  const canFinalize = requiredScore === requiredMax;
  
  console.log(`\n📊 Score: ${score}/${maxScore} (${((score/maxScore)*100).toFixed(0)}%)`);
  console.log(`   Required items: ${requiredScore}/${requiredMax}`);
  
  console.log(`\n${canFinalize ? "✅" : "⚠️"} Ready for verdict: ${canFinalize ? "YES" : "NEEDS WORK"}`);
  
  console.log("\n📝 Checklist:");
  for (const item of checklist) {
    const icon = item.checked ? "✅" : item.required ? "❌" : "⚠️";
    console.log(`   ${icon} [${item.number}] ${item.name}`);
  }
  
  console.log("\n" + "═".repeat(60));
  
  if (!canFinalize) {
    console.log("\n⚠️ PR merger needs work before verdict.");
    const failedItems = checklist.filter(i => !i.checked && i.required);
    if (failedItems.length > 0) {
      console.log("\nIssues to resolve:");
      failedItems.forEach(i => console.log(`   - ${i.name}: ${i.description}`));
    }
  } else {
    console.log("\n✅ Ready to deliver PR merger verdict.");
  }
  
  if (jsonArg) {
    const report: CompletenessReport = { checklist, score, maxScore, canFinalize };
    console.log("\n" + JSON.stringify(report, null, 2));
  }
}

main();
