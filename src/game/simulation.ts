import { DEFAULT_SCENARIO_ID, POLICY_DEFINITIONS, TOOL_DEFINITIONS, getScenario } from "./scenario";
import {
  ActionCounters,
  BannerMessage,
  CityMetrics,
  GameLogEntry,
  GameState,
  GridPoint,
  IncidentForecast,
  IncidentId,
  IncidentOutlook,
  MilestoneDefinition,
  PolicyId,
  PlacementPreview,
  PlacementResult,
  StructureType,
  Tile,
  Tone,
  ToolId,
  ZoneType,
} from "./types";

const SAVE_VERSION = 3;
const WORKER_RATIO = 0.54;
const DAY_RATE = 0.19;
const CAR_COLORS = ["#f7f3df", "#ffd37f", "#86e4ff", "#ff9f91", "#9ce6bd"];

function createEmptyMetrics(stageName: string): CityMetrics {
  return {
    population: 0,
    jobs: 0,
    availableWorkers: 0,
    roadCount: 0,
    connectedLots: 0,
    developedLots: 0,
    happiness: 52,
    serviceScore: 50,
    servicePressure: 50,
    trafficScore: 78,
    demand: {
      residential: 55,
      commercial: 38,
      industrial: 34,
    },
    coverage: {
      utilityRatio: 0,
      parkRatio: 0,
      transitRatio: 0,
      employmentRatio: 0,
      congestionRatio: 0,
      pollutionRatio: 0,
      connectedLotRatio: 0,
    },
    economy: {
      income: 0,
      upkeep: 0,
      policyUpkeep: 0,
      net: 0,
    },
    zoneCounts: {
      residential: 0,
      commercial: 0,
      industrial: 0,
    },
    structureCounts: {
      park: 0,
      utility: 0,
      transit: 0,
    },
    currentStageName: stageName,
    milestoneProgress: 0,
    incidentRisk: 0,
    incidentOutlook: "Calm",
    budgetPressure: 0,
  };
}

function createActionCounters(): ActionCounters {
  return {
    playerRoads: 0,
    residentialPlaced: 0,
    commercialPlaced: 0,
    industrialPlaced: 0,
    parksPlaced: 0,
    utilitiesPlaced: 0,
    transitPlaced: 0,
    bulldozed: 0,
  };
}

function createDefaultPolicies(): Record<PolicyId, boolean> {
  return {
    mixedUseIncentives: false,
    busPriority: false,
    greenStandards: false,
  };
}

function deterministicValue(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function createTileFromCode(code: string, x: number, y: number, width: number): Tile {
  if (code === "~") {
    return {
      terrain: "water",
      road: false,
      fixed: true,
      entryRoad: false,
      zone: null,
      structure: null,
      development: 0,
      appeal: 0.34 + deterministicValue(x, y) * 0.12,
      variant: Math.floor(deterministicValue(x + 1, y + 1) * 3),
    };
  }

  if (code === "p") {
    return {
      terrain: "quay",
      road: false,
      fixed: true,
      entryRoad: false,
      zone: null,
      structure: null,
      development: 0,
      appeal: 0.68 + deterministicValue(x, y) * 0.18,
      variant: Math.floor(deterministicValue(x + 2, y + 2) * 4),
    };
  }

  if (code === "=") {
    const entryRoad = x === width - 1 || y === 0 || y === 6;
    return {
      terrain: "land",
      road: true,
      fixed: true,
      entryRoad,
      zone: null,
      structure: null,
      development: 0,
      appeal: 0.57 + deterministicValue(x, y) * 0.16,
      variant: Math.floor(deterministicValue(x + 3, y + 3) * 5),
    };
  }

  return {
    terrain: "land",
    road: false,
    fixed: false,
    entryRoad: false,
    zone: null,
    structure: null,
    development: 0,
    appeal: 0.52 + deterministicValue(x, y) * 0.28,
    variant: Math.floor(deterministicValue(x + 4, y + 4) * 5),
  };
}

function createBanner(
  state: GameState,
  title: string,
  body: string,
  tone: Tone,
  persistent = false,
): BannerMessage {
  return {
    id: state.nextLogId,
    title,
    body,
    tone,
    expiresAt: state.timeSeconds + (persistent ? 9999 : 4.5),
    persistent,
  };
}

function pushLog(state: GameState, title: string, body: string, tone: Tone): GameLogEntry {
  const entry: GameLogEntry = {
    id: state.nextLogId,
    day: state.day,
    title,
    body,
    tone,
  };

  state.nextLogId += 1;
  state.log = [entry, ...state.log].slice(0, 9);
  return entry;
}

function setBanner(
  state: GameState,
  title: string,
  body: string,
  tone: Tone,
  persistent = false,
): void {
  state.banner = createBanner(state, title, body, tone, persistent);
}

function getActivePolicyCount(state: GameState): number {
  return Object.values(state.policies).filter(Boolean).length;
}

function getPolicyUpkeep(state: GameState): number {
  return Object.entries(POLICY_DEFINITIONS).reduce((total, [id, definition]) => {
    return state.policies[id as PolicyId] ? total + definition.upkeep : total;
  }, 0);
}

interface IncidentMetricSnapshot {
  population: number;
  roadCount: number;
  utilityRatio: number;
  parkRatio: number;
  transitRatio: number;
  connectedLotRatio: number;
  congestionRatio: number;
  pollutionRatio: number;
  trafficScore: number;
}

interface IncidentDefinition {
  id: IncidentId;
  title: string;
  summary: string;
  effectSummary: string;
  mitigation: string;
  tone: Tone;
  minDay: number;
  minPopulation: number;
  scenarioIds?: string[];
  score: (state: GameState, snapshot: IncidentMetricSnapshot) => number;
  isResolved: (state: GameState, snapshot: IncidentMetricSnapshot) => boolean;
}

const INCIDENT_DEFINITIONS: IncidentDefinition[] = [
  {
    id: "gridStrain",
    title: "Grid strain",
    summary:
      "Growth has outrun the local service backbone and brownout pressure is dragging on the district.",
    effectSummary: "Services dip, confidence slips, and emergency operating costs climb.",
    mitigation: "Add utility coverage or pull new density back toward the serviced core.",
    tone: "warning",
    minDay: 10,
    minPopulation: 260,
    score: (_state, snapshot) =>
      clamp(
        Math.max(0, 0.42 - snapshot.utilityRatio) * 2.6 +
          Math.max(0, snapshot.population - 260) / 680 +
          Math.max(0, 0.88 - snapshot.connectedLotRatio) * 0.45,
        0,
        1,
      ),
    isResolved: (_state, snapshot) =>
      snapshot.utilityRatio >= 0.46 && snapshot.connectedLotRatio >= 0.9,
  },
  {
    id: "junctionLock",
    title: "Junction lock",
    summary:
      "One corridor has seized up under commuter and freight pressure, throttling movement across the district.",
    effectSummary: "Traffic performance tanks, commercial activity softens, and morale slips.",
    mitigation: "Spread growth, add transit, and take pressure off the worst chokepoint.",
    tone: "warning",
    minDay: 11,
    minPopulation: 220,
    score: (_state, snapshot) =>
      clamp(
        Math.max(0, 0.62 - snapshot.trafficScore / 100) * 1.75 +
          Math.max(0, 0.22 - snapshot.transitRatio) * 0.95 +
          Math.max(0, snapshot.congestionRatio - 0.38) * 1.55,
        0,
        1,
      ),
    isResolved: (_state, snapshot) =>
      snapshot.trafficScore >= 66 || snapshot.transitRatio >= 0.28,
  },
  {
    id: "heatwave",
    title: "Heatwave",
    summary:
      "Dense blocks are overheating and public comfort is slipping across the district core.",
    effectSummary: "Happiness and residential demand soften until the district cools down.",
    mitigation: "Increase park coverage or activate green standards to cool the district.",
    tone: "warning",
    minDay: 14,
    minPopulation: 380,
    score: (state, snapshot) =>
      clamp(
        Math.max(0, 0.24 - snapshot.parkRatio) * 2.2 +
          snapshot.pollutionRatio * 0.55 +
          Math.max(0, snapshot.population - 380) / 920 -
          (state.policies.greenStandards ? 0.2 : 0),
        0,
        1,
      ),
    isResolved: (state, snapshot) =>
      snapshot.parkRatio >= 0.28 || (state.policies.greenStandards && snapshot.parkRatio >= 0.18),
  },
  {
    id: "riverSurge",
    title: "Waterfront surge",
    summary:
      "Stormwater pressure is pushing in from the waterfront and stressing the quay-edge service network.",
    effectSummary: "Service resilience falls and emergency spend rises until the edge is stabilised.",
    mitigation: "Strengthen utilities and public-realm buffering along the waterfront edge.",
    tone: "danger",
    minDay: 12,
    minPopulation: 240,
    scenarioIds: ["north-quay", "rivergate"],
    score: (_state, snapshot) =>
      clamp(
        Math.max(0, 0.4 - snapshot.utilityRatio) * 1.25 +
          Math.max(0, 0.18 - snapshot.parkRatio) * 1.1 +
          Math.max(0, 0.88 - snapshot.connectedLotRatio) * 0.65 +
          Math.max(0, snapshot.population - 240) / 980,
        0,
        1,
      ),
    isResolved: (state, snapshot) =>
      snapshot.utilityRatio >= 0.42 &&
      snapshot.connectedLotRatio >= 0.88 &&
      (snapshot.parkRatio >= 0.16 || state.policies.greenStandards),
  },
];

function getIncidentDefinition(incidentId: IncidentId): IncidentDefinition | undefined {
  return INCIDENT_DEFINITIONS.find((definition) => definition.id === incidentId);
}

function getIncidentDefinitionsForState(state: GameState): IncidentDefinition[] {
  return INCIDENT_DEFINITIONS.filter((definition) => {
    return !definition.scenarioIds || definition.scenarioIds.includes(state.scenarioId);
  });
}

function buildIncidentSnapshot(state: GameState): IncidentMetricSnapshot {
  return {
    population: state.metrics.population,
    roadCount: state.metrics.roadCount,
    utilityRatio: state.metrics.coverage.utilityRatio,
    parkRatio: state.metrics.coverage.parkRatio,
    transitRatio: state.metrics.coverage.transitRatio,
    connectedLotRatio: state.metrics.coverage.connectedLotRatio,
    congestionRatio: state.metrics.coverage.congestionRatio,
    pollutionRatio: state.metrics.coverage.pollutionRatio,
    trafficScore: state.metrics.trafficScore,
  };
}

function getIncidentOutlook(risk: number, hasActiveIncident: boolean): IncidentOutlook {
  if (hasActiveIncident || risk >= 0.78) {
    return "Crisis";
  }
  if (risk >= 0.56) {
    return "Strain";
  }
  if (risk >= 0.28) {
    return "Watch";
  }
  return "Calm";
}

function buildIncidentForecast(
  definition: IncidentDefinition,
  state: GameState,
  snapshot: IncidentMetricSnapshot,
): IncidentForecast | null {
  if (state.day < definition.minDay || snapshot.population < definition.minPopulation) {
    return null;
  }

  const severity = definition.score(state, snapshot);
  if (severity <= 0) {
    return null;
  }

  return {
    id: definition.id,
    title: definition.title,
    summary: definition.summary,
    effectSummary: definition.effectSummary,
    mitigation: definition.mitigation,
    tone: definition.tone,
    severity,
  };
}

function getStrongestIncidentForecastFromSnapshot(
  state: GameState,
  snapshot: IncidentMetricSnapshot,
): IncidentForecast | null {
  const forecasts = getIncidentDefinitionsForState(state)
    .map((definition) => buildIncidentForecast(definition, state, snapshot))
    .filter((forecast): forecast is IncidentForecast => Boolean(forecast));

  forecasts.sort((left, right) => right.severity - left.severity);
  return forecasts[0] ?? null;
}

function isToolUnlocked(state: GameState, tool: ToolId): boolean {
  const definition = TOOL_DEFINITIONS[tool];
  return (definition.unlockStage ?? 0) <= state.stageIndex;
}

function tileIndex(state: Pick<GameState, "width">, x: number, y: number): number {
  return y * state.width + x;
}

export function getTile(state: Pick<GameState, "tiles" | "width">, x: number, y: number): Tile {
  return state.tiles[tileIndex(state, x, y)];
}

function inBounds(state: Pick<GameState, "width" | "height">, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

function getNeighbors(state: Pick<GameState, "width" | "height">, x: number, y: number): GridPoint[] {
  const candidates = [
    { x, y: y - 1 },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x - 1, y },
  ];

  return candidates.filter((point) => inBounds(state, point.x, point.y));
}

function hasAdjacentRoad(state: GameState, x: number, y: number): boolean {
  return getNeighbors(state, x, y).some((point) => getTile(state, point.x, point.y).road);
}

function getAdjacentRoads(state: GameState, x: number, y: number): GridPoint[] {
  return getNeighbors(state, x, y).filter((point) => getTile(state, point.x, point.y).road);
}

function getRoadReachability(state: GameState): Set<number> {
  const frontier: GridPoint[] = [];
  const visited = new Set<number>();

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const tile = getTile(state, x, y);
      if (tile.road && tile.entryRoad) {
        frontier.push({ x, y });
        visited.add(tileIndex(state, x, y));
      }
    }
  }

  while (frontier.length > 0) {
    const current = frontier.shift()!;
    for (const neighbor of getNeighbors(state, current.x, current.y)) {
      const tile = getTile(state, neighbor.x, neighbor.y);
      const index = tileIndex(state, neighbor.x, neighbor.y);
      if (!tile.road || visited.has(index)) {
        continue;
      }

      visited.add(index);
      frontier.push(neighbor);
    }
  }

  return visited;
}

function nearestCoverage(
  state: GameState,
  x: number,
  y: number,
  structure: StructureType,
  radius: number,
): number {
  let best = 0;

  for (let yy = Math.max(0, y - radius); yy <= Math.min(state.height - 1, y + radius); yy += 1) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(state.width - 1, x + radius); xx += 1) {
      const tile = getTile(state, xx, yy);
      if (tile.structure !== structure) {
        continue;
      }

      const distance = Math.abs(xx - x) + Math.abs(yy - y);
      const coverage = Math.max(0, 1 - distance / (radius + 1));
      best = Math.max(best, coverage);
    }
  }

  return best;
}

function nearbyIndustrialPressure(state: GameState, x: number, y: number): number {
  let pressure = 0;

  for (let yy = Math.max(0, y - 2); yy <= Math.min(state.height - 1, y + 2); yy += 1) {
    for (let xx = Math.max(0, x - 2); xx <= Math.min(state.width - 1, x + 2); xx += 1) {
      const tile = getTile(state, xx, yy);
      if (tile.zone !== "industrial" || tile.development < 18) {
        continue;
      }
      const distance = Math.abs(xx - x) + Math.abs(yy - y);
      pressure += Math.max(0, 0.42 - distance * 0.09);
    }
  }

  return Math.min(1, pressure);
}

function getDevelopmentTier(tile: Tile): number {
  if (tile.development < 18) {
    return 0;
  }

  if (tile.development < 44) {
    return 1;
  }

  if (tile.development < 74) {
    return 2;
  }

  return 3;
}

function calculateLotContribution(tile: Tile): { population: number; jobs: number } {
  const tier = getDevelopmentTier(tile);

  if (tier === 0 || !tile.zone) {
    return { population: 0, jobs: 0 };
  }

  if (tile.zone === "residential") {
    const population = 16 + tier * 16 + Math.round(tile.development * 0.16);
    return { population, jobs: 0 };
  }

  if (tile.zone === "commercial") {
    const jobs = 12 + tier * 14 + Math.round(tile.development * 0.12);
    return { population: 0, jobs };
  }

  const jobs = 18 + tier * 18 + Math.round(tile.development * 0.15);
  return { population: 0, jobs };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function evaluateMilestoneProgress(
  metrics: CityMetrics,
  milestone: MilestoneDefinition,
  treasury: number,
): number {
  const progressPopulation = metrics.population / milestone.targetPopulation;
  const progressHappiness = metrics.happiness / milestone.minHappiness;
  const progressTreasury = treasury / milestone.minTreasury;
  const progressService = metrics.serviceScore / milestone.minServiceScore;
  const progressTraffic = metrics.trafficScore / milestone.minTrafficScore;

  return clamp(
    (progressPopulation + progressHappiness + progressTreasury + progressService + progressTraffic) / 5,
    0,
    1,
  );
}

function evaluateTutorialCompletion(state: GameState): number {
  const completions =
    state.scenarioId === "rivergate"
      ? [
          state.actions.playerRoads >= 12,
          state.actions.residentialPlaced >= 10 &&
            state.actions.commercialPlaced >= 5 &&
            state.actions.industrialPlaced >= 3,
          state.actions.utilitiesPlaced >= 2 && state.actions.parksPlaced >= 2,
          state.actions.transitPlaced >= 2 && getActivePolicyCount(state) >= 1,
          state.phase === "won",
        ]
      : [
          state.actions.playerRoads >= 8,
          state.actions.residentialPlaced >= 6 && state.actions.commercialPlaced >= 3,
          state.metrics.population >= 120 && state.treasury >= 42000,
          state.actions.utilitiesPlaced >= 1 && state.actions.industrialPlaced >= 2,
          state.actions.parksPlaced >= 1 && state.phase === "won",
        ];

  return completions.filter(Boolean).length;
}

function updateMetrics(state: GameState): void {
  const scenario = getScenario(state.scenarioId);
  const reachableRoads = getRoadReachability(state);

  const zoneCounts = {
    residential: 0,
    commercial: 0,
    industrial: 0,
  };
  const structureCounts = {
    park: 0,
    utility: 0,
    transit: 0,
  };

  let population = 0;
  let jobs = 0;
  let connectedLots = 0;
  let developedLots = 0;
  let utilityCoverageAccumulator = 0;
  let parkCoverageAccumulator = 0;
  let transitCoverageAccumulator = 0;
  let pollutionAccumulator = 0;
  let zoneLotCount = 0;
  let roadCount = 0;
  const mixedUseIncentives = state.policies.mixedUseIncentives;
  const busPriority = state.policies.busPriority;
  const greenStandards = state.policies.greenStandards;

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const tile = getTile(state, x, y);
      if (tile.road) {
        roadCount += 1;
      }

      if (tile.zone) {
        zoneCounts[tile.zone] += 1;
        zoneLotCount += 1;
      }

      if (tile.structure) {
        structureCounts[tile.structure] += 1;
      }

      if (!tile.zone) {
        continue;
      }

      const adjacentRoad = getAdjacentRoads(state, x, y).find((point) =>
        reachableRoads.has(tileIndex(state, point.x, point.y)),
      );
      const connected = Boolean(adjacentRoad);
      const utilityCoverage = nearestCoverage(state, x, y, "utility", scenario.coverageRadii.utility);
      const parkCoverage = nearestCoverage(state, x, y, "park", scenario.coverageRadii.park);
      const transitCoverage = nearestCoverage(
        state,
        x,
        y,
        "transit",
        scenario.coverageRadii.transit + (busPriority ? 1 : 0),
      );
      const industrialPressure = nearbyIndustrialPressure(state, x, y);
      const effectivePollution = greenStandards ? industrialPressure * 0.65 : industrialPressure;

      if (connected) {
        connectedLots += 1;
      }

      utilityCoverageAccumulator += utilityCoverage;
      parkCoverageAccumulator += parkCoverage;
      transitCoverageAccumulator += transitCoverage;
      pollutionAccumulator += effectivePollution;

      if (connected && tile.development >= 18) {
        developedLots += 1;
      }

      if (!connected) {
        tile.development = Math.max(0, tile.development - 4.5 * DAY_RATE);
        continue;
      }

      let demand = state.metrics.demand[tile.zone];
      if (tile.zone === "residential") {
        demand +=
          parkCoverage * 18 +
          transitCoverage * 10 +
          (mixedUseIncentives ? 8 : 0) +
          (greenStandards ? 3 : 0) -
          effectivePollution * 25;
      } else if (tile.zone === "commercial") {
        demand +=
          parkCoverage * 8 +
          utilityCoverage * 10 +
          transitCoverage * 12 +
          (mixedUseIncentives ? 10 : 0) -
          effectivePollution * 6;
      } else {
        demand += utilityCoverage * 14 + transitCoverage * 4 - parkCoverage * 8 - (greenStandards ? 8 : 0);
      }

      const utilityWeight = tile.zone === "industrial" ? 0.55 : 0.72;
      const transitWeight = tile.zone === "industrial" ? 0.06 : 0.18;
      const pollutionPenalty = tile.zone === "residential" ? effectivePollution * 0.55 : effectivePollution * 0.25;
      const baseGrowth =
        (demand / 100) *
        (0.45 + utilityCoverage * utilityWeight) *
        (0.8 + transitCoverage * transitWeight) *
        (0.6 + tile.appeal * 0.4) *
        (1 - pollutionPenalty);

      tile.development = clamp(tile.development + baseGrowth * 2.8, 0, 100);

      const contribution = calculateLotContribution(tile);
      population += contribution.population;
      jobs += contribution.jobs;
    }
  }

  const availableWorkers = population * WORKER_RATIO;
  const employmentRatio = availableWorkers > 0 ? clamp(jobs / availableWorkers, 0, 1.2) : 1;
  const earlyDistrict = zoneLotCount === 0;
  const connectedLotRatio = zoneLotCount > 0 ? connectedLots / zoneLotCount : 0;
  const utilityRatio = zoneLotCount > 0 ? utilityCoverageAccumulator / zoneLotCount : 0;
  const parkRatio = zoneLotCount > 0 ? parkCoverageAccumulator / zoneLotCount : 0;
  const transitRatio = zoneLotCount > 0 ? transitCoverageAccumulator / zoneLotCount : 0;
  const pollutionRatio = zoneLotCount > 0 ? pollutionAccumulator / zoneLotCount : 0;
  const rawCongestionRatio = roadCount > 0 ? clamp(state.cars.length / Math.max(6, roadCount * 0.72), 0, 1) : 0;
  const congestionRatio = clamp(
    rawCongestionRatio - transitRatio * (busPriority ? 0.34 : 0.22),
    0,
    1,
  );
  const policyUpkeep = getPolicyUpkeep(state);

  let serviceScore = earlyDistrict
    ? 58
    : clamp(
        24 +
          utilityRatio * 28 +
          parkRatio * 16 +
          transitRatio * 12 +
          employmentRatio * 19 +
          connectedLotRatio * 14 -
          congestionRatio * 15 -
          pollutionRatio * (greenStandards ? 12 : 18),
        8,
        98,
      );
  let trafficScore = earlyDistrict
    ? 92
    : clamp(92 - congestionRatio * 72 - (1 - connectedLotRatio) * 20 + transitRatio * 8, 10, 100);
  let happiness = earlyDistrict
    ? 56
    : clamp(
        serviceScore +
          parkRatio * 8 +
          transitRatio * 4 +
          (greenStandards ? 4 : 0) -
          Math.max(0, 1 - employmentRatio) * 12 -
          pollutionRatio * 10,
        0,
        100,
      );

  let residentialDemand = earlyDistrict
    ? 64
    : clamp(
        52 +
          employmentRatio * 14 +
          serviceScore * 0.18 +
          transitRatio * 10 +
          (mixedUseIncentives ? 6 : 0) -
          zoneCounts.residential * 4.8 -
          population * 0.04,
        6,
        96,
      );
  let commercialDemand = earlyDistrict
    ? 40
    : clamp(
        28 +
          population * 0.08 +
          trafficScore * 0.16 +
          transitRatio * 12 +
          (mixedUseIncentives ? 8 : 0) -
          zoneCounts.commercial * 7.2,
        4,
        92,
      );
  let industrialDemand = earlyDistrict
    ? 28
    : clamp(
        22 +
          population * 0.05 +
          utilityRatio * 16 +
          transitRatio * 4 +
          Math.max(0, 1 - employmentRatio) * 18 -
          (greenStandards ? 10 : 0) -
          zoneCounts.industrial * 8.4,
        4,
        90,
      );

  let income = population * 1.62 + jobs * 0.81 + (mixedUseIncentives ? population * 0.05 : 0);
  let upkeep =
    roadCount * 0.52 +
    zoneLotCount * 0.21 +
    structureCounts.park * 4.2 +
    structureCounts.utility * 12.6 +
    structureCounts.transit * 8.8 +
    policyUpkeep;

  const congestionPenalty = clamp(congestionRatio * 0.22 + (1 - connectedLotRatio) * 0.14, 0, 0.48);
  const freightDrag = clamp(congestionRatio * 0.06 + pollutionRatio * 0.04, 0, 0.2);
  income *= 1 - congestionPenalty - freightDrag;
  upkeep *= 1 + congestionRatio * 0.32 + (1 - connectedLotRatio) * 0.14;

  residentialDemand -= Math.max(0, congestionRatio - 0.28) * 8;
  commercialDemand -= Math.max(0, congestionRatio - 0.24) * 12;
  industrialDemand -= Math.max(0, congestionRatio - 0.26) * 10;

  if (state.activeIncident) {
    const severity = clamp(
      0.62 + state.activeIncident.severity * 0.82 + Math.min(state.activeIncident.daysActive, 5) * 0.04,
      0.6,
      1.45,
    );

    if (state.activeIncident.id === "gridStrain") {
      serviceScore -= 5 + severity * 7;
      happiness -= 2 + severity * 4;
      upkeep += 10 + severity * 10;
      residentialDemand -= 2 + severity * 4;
    } else if (state.activeIncident.id === "junctionLock") {
      trafficScore -= 9 + severity * 9;
      happiness -= 2 + severity * 3;
      commercialDemand -= 4 + severity * 5;
      income *= 1 - (0.03 + severity * 0.03);
    } else if (state.activeIncident.id === "heatwave") {
      happiness -= 6 + severity * 6;
      serviceScore -= 3 + severity * 4;
      residentialDemand -= 4 + severity * 4;
    } else if (state.activeIncident.id === "riverSurge") {
      serviceScore -= 6 + severity * 6;
      trafficScore -= 3 + severity * 4;
      upkeep += 8 + severity * 10;
      commercialDemand -= 2 + severity * 3;
    }
  }

  serviceScore = clamp(serviceScore, 8, 98);
  trafficScore = clamp(trafficScore, 10, 100);
  const budgetPressure = clamp((upkeep / Math.max(1, income) - 0.68) / 0.85, 0, 1);
  happiness = clamp(happiness, 0, 100);
  residentialDemand = clamp(residentialDemand, 4, 96);
  commercialDemand = clamp(commercialDemand, 4, 92);
  industrialDemand = clamp(industrialDemand, 4, 90);

  const currentMilestone = scenario.milestones[state.stageIndex];
  const milestoneProgress = currentMilestone
    ? evaluateMilestoneProgress(
        {
          population: Math.round(population),
          jobs: Math.round(jobs),
          availableWorkers: Math.round(availableWorkers),
          roadCount,
          connectedLots,
          developedLots,
          happiness: Math.round(happiness),
          serviceScore: Math.round(serviceScore),
          servicePressure: Math.round(100 - serviceScore),
          trafficScore: Math.round(trafficScore),
          demand: {
            residential: Math.round(residentialDemand),
            commercial: Math.round(commercialDemand),
            industrial: Math.round(industrialDemand),
          },
          coverage: {
            utilityRatio,
            parkRatio,
            transitRatio,
            employmentRatio,
            congestionRatio,
            pollutionRatio,
            connectedLotRatio,
          },
          economy: {
            income,
            upkeep,
            policyUpkeep,
            net: income - upkeep,
          },
          zoneCounts,
          structureCounts,
          currentStageName: currentMilestone.stageName,
          milestoneProgress: 0,
          incidentRisk: 0,
          incidentOutlook: "Calm",
          budgetPressure: 0,
        },
        currentMilestone,
        state.treasury,
      )
    : 1;

  state.metrics = {
    population: Math.round(population),
    jobs: Math.round(jobs),
    availableWorkers: Math.round(availableWorkers),
    roadCount,
    connectedLots,
    developedLots,
    happiness: Math.round(happiness),
    serviceScore: Math.round(serviceScore),
    servicePressure: Math.round(100 - serviceScore),
    trafficScore: Math.round(trafficScore),
    demand: {
      residential: Math.round(residentialDemand),
      commercial: Math.round(commercialDemand),
      industrial: Math.round(industrialDemand),
    },
    coverage: {
      utilityRatio,
      parkRatio,
      transitRatio,
      employmentRatio,
      congestionRatio,
      pollutionRatio,
      connectedLotRatio,
    },
    economy: {
      income,
      upkeep,
      policyUpkeep,
      net: income - upkeep,
    },
    zoneCounts,
    structureCounts,
    currentStageName:
      scenario.milestones[Math.min(state.stageIndex, scenario.milestones.length - 1)]?.stageName ??
      "Pilot",
    milestoneProgress,
    incidentRisk: 0,
    incidentOutlook: "Calm",
    budgetPressure,
  };

  const forecast = getStrongestIncidentForecastFromSnapshot(state, {
    population: state.metrics.population,
    roadCount: state.metrics.roadCount,
    utilityRatio: state.metrics.coverage.utilityRatio,
    parkRatio: state.metrics.coverage.parkRatio,
    transitRatio: state.metrics.coverage.transitRatio,
    connectedLotRatio: state.metrics.coverage.connectedLotRatio,
    congestionRatio: state.metrics.coverage.congestionRatio,
    pollutionRatio: state.metrics.coverage.pollutionRatio,
    trafficScore: state.metrics.trafficScore,
  });
  state.metrics.incidentRisk = clamp(
    Math.max(state.activeIncident?.severity ?? 0, forecast?.severity ?? 0),
    0,
    1,
  );
  state.metrics.incidentOutlook = getIncidentOutlook(
    state.metrics.incidentRisk,
    Boolean(state.activeIncident),
  );
}

function getCandidateOrigins(state: GameState): GridPoint[] {
  const origins: GridPoint[] = [];

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const tile = getTile(state, x, y);
      if (tile.zone === "residential" && tile.development >= 25 && hasAdjacentRoad(state, x, y)) {
        origins.push({ x, y });
      }
    }
  }

  return origins;
}

function getCandidateDestinations(state: GameState): GridPoint[] {
  const destinations: GridPoint[] = [];

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const tile = getTile(state, x, y);
      if ((tile.zone === "commercial" || tile.zone === "industrial") && tile.development >= 20 && hasAdjacentRoad(state, x, y)) {
        destinations.push({ x, y });
      }
    }
  }

  return destinations;
}

function getEntryRoads(state: GameState): GridPoint[] {
  const entries: GridPoint[] = [];

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const tile = getTile(state, x, y);
      if (tile.road && tile.entryRoad) {
        entries.push({ x, y });
      }
    }
  }

  return entries;
}

function shortestRoadPath(state: GameState, start: GridPoint, goal: GridPoint): GridPoint[] | null {
  const queue: GridPoint[] = [start];
  const cameFrom = new Map<number, number | null>();
  const startIndex = tileIndex(state, start.x, start.y);
  const goalIndex = tileIndex(state, goal.x, goal.y);
  cameFrom.set(startIndex, null);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentIndex = tileIndex(state, current.x, current.y);
    if (currentIndex === goalIndex) {
      break;
    }

    for (const neighbor of getNeighbors(state, current.x, current.y)) {
      const tile = getTile(state, neighbor.x, neighbor.y);
      if (!tile.road) {
        continue;
      }

      const neighborIndex = tileIndex(state, neighbor.x, neighbor.y);
      if (cameFrom.has(neighborIndex)) {
        continue;
      }

      cameFrom.set(neighborIndex, currentIndex);
      queue.push(neighbor);
    }
  }

  if (!cameFrom.has(goalIndex)) {
    return null;
  }

  const path: GridPoint[] = [];
  let currentIndex: number | null = goalIndex;
  while (currentIndex !== null) {
    const x = currentIndex % state.width;
    const y = Math.floor(currentIndex / state.width);
    path.push({ x, y });
    currentIndex = cameFrom.get(currentIndex) ?? null;
  }

  return path.reverse();
}

function chooseRoadAccess(state: GameState, point: GridPoint): GridPoint | null {
  const adjacentRoads = getAdjacentRoads(state, point.x, point.y);
  return adjacentRoads[0] ?? null;
}

function spawnTraffic(state: GameState, deltaDays: number): void {
  const origins = getCandidateOrigins(state);
  const destinations = getCandidateDestinations(state);
  const entries = getEntryRoads(state);
  const transitModifier = state.metrics.coverage.transitRatio * (state.policies.busPriority ? 0.35 : 0.22);

  const targetTrips = clamp(
    (state.metrics.population / 110 + state.metrics.jobs / 160 + state.metrics.roadCount / 32) * (1 - transitModifier),
    0.2,
    7,
  );
  const ambientTrips = clamp(state.metrics.roadCount / 50, 0.05, 1.25);

  state.tripAccumulator += targetTrips * deltaDays * 0.55;
  state.ambientAccumulator += ambientTrips * deltaDays * 0.2;

  while (state.tripAccumulator >= 1 && origins.length > 0) {
    state.tripAccumulator -= 1;
    const origin = origins[Math.floor(Math.random() * origins.length)];
    const destinationPool = destinations.length > 0 ? destinations : entries;
    const destination = destinationPool[Math.floor(Math.random() * destinationPool.length)];
    const roadStart = chooseRoadAccess(state, origin);
    const roadGoal = chooseRoadAccess(state, destination) ?? destination;

    if (!roadStart || !roadGoal) {
      continue;
    }

    const path = shortestRoadPath(state, roadStart, roadGoal);
    if (!path || path.length < 2) {
      continue;
    }

    state.cars.push({
      id: state.nextCarId,
      path,
      segmentIndex: 0,
      progress: 0,
      speed: 0.65 + Math.random() * 0.55,
      color: CAR_COLORS[state.nextCarId % CAR_COLORS.length],
      kind: destinationPool === entries ? "ambient" : "commuter",
    });
    state.nextCarId += 1;
  }

  while (state.ambientAccumulator >= 1 && entries.length >= 2) {
    state.ambientAccumulator -= 1;
    const start = entries[Math.floor(Math.random() * entries.length)];
    let goal = entries[Math.floor(Math.random() * entries.length)];
    if (goal.x === start.x && goal.y === start.y) {
      goal = entries[(entries.indexOf(goal) + 1) % entries.length];
    }

    const path = shortestRoadPath(state, start, goal);
    if (!path || path.length < 4) {
      continue;
    }

    state.cars.push({
      id: state.nextCarId,
      path,
      segmentIndex: 0,
      progress: 0,
      speed: 0.55 + Math.random() * 0.38,
      color: CAR_COLORS[state.nextCarId % CAR_COLORS.length],
      kind: "ambient",
    });
    state.nextCarId += 1;
  }
}

function updateCars(state: GameState, deltaDays: number): void {
  const effectiveSpeed = 2.3 * (1 - state.metrics.coverage.congestionRatio * 0.38);

  state.cars = state.cars.filter((car) => {
    if (car.path.length < 2) {
      return false;
    }

    const segmentStep = deltaDays * 3.2 * effectiveSpeed * car.speed;
    car.progress += segmentStep;

    while (car.progress >= 1) {
      car.progress -= 1;
      car.segmentIndex += 1;
      if (car.segmentIndex >= car.path.length - 1) {
        return false;
      }
    }

    return true;
  });
}

function maybeIssuePressureWarning(state: GameState, deltaDays: number): void {
  if (state.phase !== "running") {
    return;
  }

  if (state.day < 8 || state.metrics.population < 30) {
    state.warningAccumulator = 0;
    return;
  }

  if (state.metrics.serviceScore < 38 || state.metrics.trafficScore < 36 || state.treasury < 12000) {
    state.warningAccumulator += deltaDays;
  } else {
    state.warningAccumulator = Math.max(0, state.warningAccumulator - deltaDays * 1.8);
  }

  if (state.warningAccumulator >= 1.35) {
    state.warningAccumulator = 0;
    pushLog(
      state,
      "Advisory",
      "The district is showing strain. Improve services or road access before the review turns against you.",
      "warning",
    );
    setBanner(
      state,
      "District strain",
      "Traffic, services, or budget pressure are starting to undercut growth.",
      "warning",
    );
  }
}

function maybeAdvanceMilestones(state: GameState): void {
  const scenario = getScenario(state.scenarioId);
  const nextMilestone = scenario.milestones[state.stageIndex];

  if (!nextMilestone || state.phase !== "running") {
    return;
  }

  const success =
    state.metrics.population >= nextMilestone.targetPopulation &&
    state.metrics.happiness >= nextMilestone.minHappiness &&
    state.treasury >= nextMilestone.minTreasury &&
    state.metrics.serviceScore >= nextMilestone.minServiceScore &&
    state.metrics.trafficScore >= nextMilestone.minTrafficScore;

  if (!success) {
    return;
  }

  state.stageIndex += 1;
  if (nextMilestone.reward > 0) {
    state.treasury += nextMilestone.reward;
  }
  const unlockedTools = Object.values(TOOL_DEFINITIONS)
    .filter((definition) => (definition.unlockStage ?? 0) === state.stageIndex)
    .map((definition) => definition.label);
  const unlockedPolicies = Object.values(POLICY_DEFINITIONS)
    .filter((definition) => definition.unlockStage === state.stageIndex)
    .map((definition) => definition.label);
  const rewardSummary = nextMilestone.reward > 0 ? ` Grant awarded: ${formatMoney(nextMilestone.reward)}.` : "";
  const unlockSummary =
    unlockedTools.length > 0 || unlockedPolicies.length > 0
      ? ` New planning layers unlocked: ${[...unlockedTools, ...unlockedPolicies].join(", ")}.`
      : "";
  pushLog(state, nextMilestone.title, nextMilestone.description, "success");
  setBanner(
    state,
    nextMilestone.title,
    `${nextMilestone.description}${rewardSummary}${unlockSummary}`,
    "success",
    true,
  );

  if (unlockedTools.length > 0 || unlockedPolicies.length > 0) {
    pushLog(
      state,
      "Planning layer unlocked",
      `The district can now deploy ${[...unlockedTools, ...unlockedPolicies].join(", ")}.`,
      "info",
    );
  }

  if (state.stageIndex >= scenario.milestones.length) {
    state.phase = "won";
    state.paused = true;
    pushLog(
      state,
      "Review passed",
      `${scenario.districtName} has crossed the final review threshold and is ready for presentation.`,
      "success",
    );
  }
}

function maybeUpdateTutorialProgress(state: GameState): void {
  const completed = evaluateTutorialCompletion(state);
  if (completed <= state.tutorialProgress) {
    return;
  }

  const scenario = getScenario(state.scenarioId);
  for (let index = state.tutorialProgress; index < completed; index += 1) {
    const step = scenario.tutorial[index];
    if (!step) {
      continue;
    }
    pushLog(state, `Tutorial: ${step.title}`, step.description, "success");
  }
  state.tutorialProgress = completed;
}

function updateIncidentState(state: GameState, deltaDays: number): void {
  if (state.phase !== "running") {
    return;
  }

  state.incidentCooldown = Math.max(0, state.incidentCooldown - deltaDays);
  const snapshot = buildIncidentSnapshot(state);

  if (state.activeIncident) {
    const definition = getIncidentDefinition(state.activeIncident.id);
    state.activeIncident.daysActive += deltaDays;

    if (definition && definition.isResolved(state, snapshot)) {
      const resolvedIncident = state.activeIncident;
      state.activeIncident = null;
      state.incidentCooldown = 4.8;
      pushLog(
        state,
        `${resolvedIncident.title} stabilised`,
        `${resolvedIncident.title} has been brought back under control. ${resolvedIncident.mitigation}`,
        "success",
      );
      setBanner(
        state,
        `${resolvedIncident.title} stabilised`,
        "The district has contained the disruption and returned to normal operations.",
        "success",
      );
      return;
    }

    if (!definition) {
      return;
    }

    const forecast = buildIncidentForecast(definition, state, snapshot);
    state.activeIncident.severity = clamp(forecast?.severity ?? 0.18, 0.18, 1);
    return;
  }

  if (state.incidentCooldown > 0) {
    return;
  }

  const forecast = getStrongestIncidentForecastFromSnapshot(state, snapshot);
  if (!forecast || forecast.severity < 0.64) {
    return;
  }

  state.activeIncident = {
    ...forecast,
    startedDay: state.day,
    daysActive: 0,
  };
  pushLog(state, forecast.title, forecast.summary, forecast.tone);
  setBanner(
    state,
    forecast.title,
    `${forecast.summary} ${forecast.mitigation}`,
    forecast.tone,
    true,
  );
}

function maybeLose(state: GameState, deltaDays: number): void {
  if (state.phase !== "running") {
    return;
  }

  if (state.day < 18 || state.metrics.population < 60) {
    state.stressTimer = 0;
    return;
  }

  if (state.treasury < 0 || state.metrics.happiness < 28) {
    state.stressTimer += deltaDays;
  } else {
    state.stressTimer = Math.max(0, state.stressTimer - deltaDays * 1.6);
  }

  if (state.stressTimer >= 2.6) {
    state.phase = "lost";
    state.paused = true;
    pushLog(
      state,
      "District review failed",
      "The treasury and public confidence fell too far before the district could stabilise.",
      "danger",
    );
    setBanner(
      state,
      "District review failed",
      "Start a fresh run or continue from the last save and rebalance the district.",
      "danger",
      true,
    );
  }
}

export function createGameState(scenarioId = DEFAULT_SCENARIO_ID): GameState {
  const scenario = getScenario(scenarioId);
  const height = scenario.layout.length;
  const width = scenario.layout[0]?.length ?? 0;
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const code = scenario.layout[y][x];
      tiles.push(createTileFromCode(code, x, y, width));
    }
  }

  const state: GameState = {
    version: SAVE_VERSION,
    scenarioId,
    phase: "running",
    width,
    height,
    tiles,
    timeSeconds: 0,
    simulationDays: 0,
    day: 1,
    treasury: scenario.startTreasury,
    paused: false,
    speed: 1,
    metrics: createEmptyMetrics(scenario.milestones[0].stageName),
    stageIndex: 0,
    tutorialProgress: 0,
    tripAccumulator: 0,
    ambientAccumulator: 0,
    stressTimer: 0,
    warningAccumulator: 0,
    nextCarId: 1,
    nextLogId: 1,
    banner: null,
    log: [],
    actions: createActionCounters(),
    policies: createDefaultPolicies(),
    activeIncident: null,
    incidentCooldown: 0,
    cars: [],
  };

  updateMetrics(state);
  pushLog(
    state,
    `${scenario.districtName} brief`,
    scenario.prompt,
    "info",
  );
  setBanner(
    state,
    `${scenario.districtName} briefing`,
    `${scenario.introBody} Build toward ${scenario.milestones[scenario.milestones.length - 1].stageName}.`,
    "info",
    true,
  );

  return state;
}

export function rehydrateGameState(rawState: GameState): GameState {
  const scenario = getScenario(rawState.scenarioId);
  const state: GameState = {
    ...rawState,
    version: SAVE_VERSION,
    banner: rawState.banner,
    paused: rawState.phase !== "running" ? true : rawState.paused,
    simulationDays: rawState.simulationDays ?? Math.max(0, rawState.day - 1),
    actions: {
      ...createActionCounters(),
      ...rawState.actions,
    },
    policies: {
      ...createDefaultPolicies(),
      ...rawState.policies,
    },
    activeIncident: rawState.activeIncident ?? null,
    incidentCooldown: rawState.incidentCooldown ?? 0,
    metrics: createEmptyMetrics(
      scenario.milestones[Math.min(rawState.stageIndex, scenario.milestones.length - 1)]?.stageName ?? "Pilot",
    ),
  };

  updateMetrics(state);
  return state;
}

export function dismissBanner(state: GameState): void {
  if (state.banner?.persistent) {
    state.banner = null;
  }
}

export function setGamePaused(state: GameState, paused: boolean): void {
  if (state.phase !== "running") {
    return;
  }
  state.paused = paused;
}

export function setGameSpeed(state: GameState, speed: 1 | 2 | 3): void {
  state.speed = speed;
}

export function togglePolicy(state: GameState, policyId: PolicyId): { active: boolean; reason: string } {
  const definition = POLICY_DEFINITIONS[policyId];
  if (!definition) {
    return { active: false, reason: "Unknown policy." };
  }

  if (state.stageIndex < definition.unlockStage) {
    return {
      active: Boolean(state.policies[policyId]),
      reason: `${definition.label} unlocks later in the district programme.`,
    };
  }

  state.policies[policyId] = !state.policies[policyId];
  const active = state.policies[policyId];
  pushLog(
    state,
    active ? `${definition.label} active` : `${definition.label} paused`,
    active
      ? `${definition.label} is now shaping the district plan. Daily upkeep rises by ${formatMoney(definition.upkeep)}.`
      : `${definition.label} has been turned off to ease pressure on the district budget.`,
    active ? "success" : "info",
  );
  setBanner(
    state,
    active ? `${definition.label} enabled` : `${definition.label} disabled`,
    active
      ? `${definition.description} Budget impact: ${formatMoney(definition.upkeep)}/day.`
      : "The district has reverted to its baseline planning rules.",
    active ? "success" : "info",
  );

  return {
    active,
    reason: active ? `${definition.label} enabled.` : `${definition.label} disabled.`,
  };
}

export function advanceGameState(state: GameState, deltaSeconds: number): void {
  if (state.banner && !state.banner.persistent && state.timeSeconds > state.banner.expiresAt) {
    state.banner = null;
  }

  if (state.paused || state.phase !== "running") {
    return;
  }

  const deltaDays = deltaSeconds * DAY_RATE * state.speed;
  state.timeSeconds += deltaSeconds;
  state.simulationDays += deltaDays;
  state.day = Math.max(1, Math.floor(state.simulationDays) + 1);

  updateMetrics(state);
  state.treasury += state.metrics.economy.net * deltaDays;

  spawnTraffic(state, deltaDays);
  updateCars(state, deltaDays);
  updateMetrics(state);
  updateIncidentState(state, deltaDays);
  updateMetrics(state);
  maybeIssuePressureWarning(state, deltaDays);
  maybeAdvanceMilestones(state);
  maybeUpdateTutorialProgress(state);
  maybeLose(state, deltaDays);
}

function canBuildOnTile(tile: Tile): boolean {
  return tile.terrain === "land" && !tile.fixed;
}

export function evaluatePlacement(
  state: GameState,
  x: number,
  y: number,
  tool: ToolId,
): PlacementPreview {
  const tile = getTile(state, x, y);
  const cost = TOOL_DEFINITIONS[tool].cost;

  if (tool === "bulldoze") {
    if (tile.fixed) {
      return { allowed: false, cost, reason: "Fixed waterfront or arterial tiles cannot be cleared." };
    }

    if (!tile.road && !tile.zone && !tile.structure) {
      return { allowed: false, cost, reason: "There is nothing here to clear." };
    }

    if (state.treasury < cost) {
      return { allowed: false, cost, reason: "Treasury is too low for clearance work." };
    }

    return { allowed: true, cost, reason: "Clear the current player-built tile." };
  }

  if (!isToolUnlocked(state, tool)) {
    const unlockStage = TOOL_DEFINITIONS[tool].unlockStage ?? 0;
    const milestone = getScenario(state.scenarioId).milestones[Math.max(0, unlockStage - 1)];
    return {
      allowed: false,
      cost,
      reason: milestone
        ? `${TOOL_DEFINITIONS[tool].label} unlocks after ${milestone.stageName}.`
        : `${TOOL_DEFINITIONS[tool].label} is not unlocked yet.`,
    };
  }

  if (!canBuildOnTile(tile)) {
    return {
      allowed: false,
      cost,
      reason: tile.terrain === "water" ? "Water tiles are reserved for the quay edge." : "This tile is reserved.",
    };
  }

  if (state.treasury < cost) {
    return {
      allowed: false,
      cost,
      reason: "Treasury is too low for this placement.",
    };
  }

  if (tool === "road") {
    if (tile.road) {
      return { allowed: false, cost, reason: "Road already present on this tile." };
    }
    if (tile.zone || tile.structure) {
      return { allowed: false, cost, reason: "Clear the current lot before laying a road." };
    }
    return { allowed: true, cost, reason: "Lay a road segment." };
  }

  if (tile.road) {
    return { allowed: false, cost, reason: "Zoning and structures cannot sit on active road tiles." };
  }

  if (tool === "park" || tool === "utility") {
    if (tile.zone || tile.structure) {
      return { allowed: false, cost, reason: "This lot is already assigned." };
    }
    return {
      allowed: true,
      cost,
      reason: tool === "park" ? "Place a district park." : "Place compact district utilities.",
    };
  }

  if (tile.zone === tool) {
    return { allowed: false, cost, reason: "This lot is already zoned the same way." };
  }

  if (tile.structure) {
    return { allowed: false, cost, reason: "Clear the current structure before zoning this lot." };
  }

  return {
    allowed: true,
    cost,
    reason: `Zone this tile for ${tool}.`,
  };
}

export function applyTool(state: GameState, x: number, y: number, tool: ToolId): PlacementResult {
  const preview = evaluatePlacement(state, x, y, tool);
  if (!preview.allowed) {
    setBanner(state, "Placement rejected", preview.reason, "warning");
    return { ...preview, tone: "warning" };
  }

  const tile = getTile(state, x, y);
  state.treasury -= preview.cost;

  if (tool === "bulldoze") {
    tile.road = false;
    tile.zone = null;
    tile.structure = null;
    tile.development = 0;
    state.actions.bulldozed += 1;
    setBanner(state, "Tile cleared", "The lot has been returned to undeveloped land.", "info");
    return { ...preview, tone: "info", reason: "Tile cleared." };
  }

  if (tool === "road") {
    tile.road = true;
    tile.zone = null;
    tile.structure = null;
    tile.development = 0;
    state.actions.playerRoads += 1;
    setBanner(state, "Road added", "The district spine has been extended.", "info");
    return { ...preview, tone: "success", reason: "Road placed." };
  }

  tile.road = false;
  tile.structure = null;
  tile.zone = null;
  tile.development = 2;

  if (tool === "park") {
    tile.structure = "park";
    state.actions.parksPlaced += 1;
    pushLog(state, "Public realm", "A new park has been added to soften the district edge.", "info");
    setBanner(state, "Park added", "Nearby homes and shops will feel the benefit.", "success");
    return { ...preview, tone: "success", reason: "Park placed." };
  }

  if (tool === "utility") {
    tile.structure = "utility";
    state.actions.utilitiesPlaced += 1;
    pushLog(state, "Utility support", "A district utility tile has strengthened local coverage.", "info");
    setBanner(state, "Utility added", "Growth will stabilise around serviced blocks.", "success");
    return { ...preview, tone: "success", reason: "Utility placed." };
  }

  if (tool === "transit") {
    tile.structure = "transit";
    state.actions.transitPlaced += 1;
    pushLog(state, "Transit stop", "A neighbourhood stop now anchors a stronger mobility corridor.", "info");
    setBanner(state, "Transit added", "Nearby homes and shops will feel the extra movement capacity.", "success");
    return { ...preview, tone: "success", reason: "Transit placed." };
  }

  tile.zone = tool as ZoneType;
  if (tool === "residential") {
    state.actions.residentialPlaced += 1;
  } else if (tool === "commercial") {
    state.actions.commercialPlaced += 1;
  } else if (tool === "industrial") {
    state.actions.industrialPlaced += 1;
  }

  setBanner(
    state,
    `${TOOL_DEFINITIONS[tool].label} zoned`,
    `${TOOL_DEFINITIONS[tool].label} frontage committed to the district plan.`,
    "success",
  );

  return {
    ...preview,
    tone: "success",
    reason: `${TOOL_DEFINITIONS[tool].label} placed.`,
  };
}

export function getCurrentMilestone(state: GameState): MilestoneDefinition | null {
  const scenario = getScenario(state.scenarioId);
  return scenario.milestones[state.stageIndex] ?? null;
}

export function getTutorialStatus(state: GameState): {
  completed: number;
  activeIndex: number;
  total: number;
} {
  const scenario = getScenario(state.scenarioId);
  const completed = evaluateTutorialCompletion(state);
  return {
    completed,
    activeIndex: Math.min(completed, scenario.tutorial.length - 1),
    total: scenario.tutorial.length,
  };
}

export function getIncidentForecast(state: GameState): IncidentForecast | null {
  return getStrongestIncidentForecastFromSnapshot(state, buildIncidentSnapshot(state));
}

function placeToolOnce(state: GameState, tool: ToolId, placements: GridPoint[]): void {
  for (const point of placements) {
    const preview = evaluatePlacement(state, point.x, point.y, tool);
    if (!preview.allowed) {
      continue;
    }
    applyTool(state, point.x, point.y, tool);
  }
}

export function createReviewGameState(scenarioId = "rivergate"): GameState {
  if (scenarioId === "north-quay") {
    const state = createGameState("north-quay");

    placeToolOnce(state, "road", [
      { x: 8, y: 5 },
      { x: 7, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 4 },
      { x: 5, y: 3 },
      { x: 6, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 4 },
      { x: 6, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 5 },
      { x: 10, y: 8 },
      { x: 11, y: 8 },
      { x: 12, y: 8 },
      { x: 11, y: 9 },
      { x: 10, y: 9 },
    ]);

    placeToolOnce(state, "utility", [
      { x: 6, y: 8 },
      { x: 12, y: 9 },
    ]);

    placeToolOnce(state, "park", [
      { x: 4, y: 6 },
      { x: 3, y: 4 },
    ]);

    placeToolOnce(state, "residential", [
      { x: 6, y: 2 },
      { x: 7, y: 2 },
      { x: 5, y: 2 },
      { x: 6, y: 1 },
      { x: 7, y: 1 },
      { x: 5, y: 1 },
      { x: 4, y: 3 },
    ]);

    placeToolOnce(state, "commercial", [
      { x: 8, y: 4 },
      { x: 8, y: 3 },
      { x: 8, y: 7 },
      { x: 7, y: 7 },
    ]);

    placeToolOnce(state, "industrial", [
      { x: 13, y: 8 },
      { x: 13, y: 9 },
      { x: 12, y: 10 },
      { x: 11, y: 10 },
    ]);

    for (let step = 0; step < 700; step += 1) {
      advanceGameState(state, 0.5);
      if (state.stageIndex >= 1) {
        placeToolOnce(state, "transit", [{ x: 8, y: 8 }]);
        state.policies.mixedUseIncentives = true;
        state.policies.busPriority = true;
      }
      if (state.stageIndex >= 2) {
        state.policies.greenStandards = true;
      }

      if (state.stageIndex >= 2 && state.phase === "running") {
        break;
      }
      if (state.phase !== "running") {
        break;
      }
    }

    state.paused = true;
    state.banner = null;
    return state;
  }

  if (scenarioId !== "rivergate") {
    const fallback = createGameState(scenarioId);
    fallback.paused = true;
    fallback.banner = null;
    return fallback;
  }

  const state = createGameState("rivergate");

  placeToolOnce(state, "road", [
    { x: 4, y: 5 },
    { x: 3, y: 5 },
    { x: 2, y: 5 },
    { x: 1, y: 5 },
    { x: 9, y: 4 },
    { x: 8, y: 4 },
    { x: 7, y: 4 },
    { x: 8, y: 6 },
    { x: 7, y: 6 },
    { x: 6, y: 6 },
    { x: 5, y: 6 },
    { x: 4, y: 6 },
  ]);

  placeToolOnce(state, "utility", [
    { x: 6, y: 4 },
    { x: 11, y: 8 },
    { x: 13, y: 10 },
    { x: 10, y: 10 },
  ]);
  placeToolOnce(state, "park", [
    { x: 11, y: 1 },
    { x: 14, y: 3 },
    { x: 10, y: 12 },
    { x: 5, y: 7 },
  ]);
  placeToolOnce(state, "residential", [
    { x: 5, y: 4 },
    { x: 11, y: 7 },
    { x: 10, y: 6 },
    { x: 11, y: 11 },
    { x: 12, y: 13 },
    { x: 13, y: 8 },
    { x: 12, y: 4 },
    { x: 10, y: 11 },
    { x: 14, y: 4 },
    { x: 10, y: 8 },
    { x: 11, y: 9 },
    { x: 11, y: 10 },
    { x: 10, y: 13 },
    { x: 4, y: 7 },
  ]);
  placeToolOnce(state, "commercial", [
    { x: 10, y: 7 },
    { x: 7, y: 3 },
    { x: 8, y: 8 },
    { x: 8, y: 9 },
    { x: 14, y: 6 },
    { x: 11, y: 3 },
  ]);
  placeToolOnce(state, "industrial", [
    { x: 13, y: 9 },
    { x: 13, y: 7 },
    { x: 15, y: 6 },
    { x: 13, y: 11 },
  ]);

  for (let step = 0; step < 900; step += 1) {
    advanceGameState(state, 0.5);
    if (state.stageIndex >= 1) {
      placeToolOnce(state, "transit", [
        { x: 11, y: 0 },
        { x: 14, y: 2 },
        { x: 11, y: 12 },
      ]);
      state.policies.mixedUseIncentives = true;
      state.policies.busPriority = true;
    }
    if (state.stageIndex >= 2) {
      state.policies.greenStandards = true;
    }

    if (state.stageIndex >= 3 && state.phase === "running") {
      break;
    }
    if (state.phase !== "running") {
      break;
    }
  }

  state.paused = true;
  state.banner = null;
  return state;
}

export function snapshotGameState(state: GameState): GameState {
  return structuredClone(state);
}

export function formatMoney(value: number): string {
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });
  return formatter.format(value);
}
