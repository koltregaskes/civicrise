import { createReviewGameState } from "../src/game/simulation";
import { getScenario } from "../src/game/scenario";

function getArgValue(flag: string): string | null {
  const index = process.argv.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (index === -1) {
    return null;
  }
  const arg = process.argv[index];
  if (arg.includes("=")) {
    return arg.split("=").slice(1).join("=");
  }
  const next = process.argv[index + 1];
  return next && !next.startsWith("--") ? next : null;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

const scenarioId = getArgValue("--scenario") ?? "rivergate";
const scenario = getScenario(scenarioId);
const state = createReviewGameState(scenarioId);

const issues: string[] = [];

if (!state.tiles.length || state.width <= 0 || state.height <= 0) {
  issues.push("State grid is not initialised.");
}

if (state.scenarioId !== scenarioId) {
  issues.push(`Scenario mismatch (expected ${scenarioId}, got ${state.scenarioId}).`);
}

if (state.phase === "lost") {
  issues.push("Review slice booted into a lost state.");
}

if (!isFiniteNumber(state.metrics.population) || state.metrics.population <= 0) {
  issues.push("Population metric is missing or zero.");
}

if (!isFiniteNumber(state.metrics.trafficScore) || state.metrics.trafficScore <= 0) {
  issues.push("Traffic score metric is missing or zero.");
}

if (!isFiniteNumber(state.metrics.economy.income)) {
  issues.push("Economy income metric is not a finite number.");
}

if (!isFiniteNumber(state.metrics.budgetPressure)) {
  issues.push("Budget pressure metric is not a finite number.");
}

if (state.treasury <= 0) {
  issues.push("Treasury is not positive.");
}

if (!scenario) {
  issues.push("Scenario definition not found.");
}

if (issues.length > 0) {
  console.error(`Smoke check failed for ${scenarioId}:`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(
  `Smoke check OK for ${scenarioId}: population=${state.metrics.population}, stage=${state.stageIndex}, treasury=${state.treasury}.`,
);
