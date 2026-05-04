export type TerrainType = "land" | "water" | "quay";
export type ZoneType = "residential" | "commercial" | "industrial";
export type StructureType = "park" | "utility" | "transit";
export type ToolId =
  | "road"
  | "residential"
  | "commercial"
  | "industrial"
  | "park"
  | "utility"
  | "transit"
  | "bulldoze";
export type PolicyId = "mixedUseIncentives" | "busPriority" | "greenStandards";
export type IncidentId = "gridStrain" | "junctionLock" | "heatwave" | "riverSurge";
export type IncidentOutlook = "Calm" | "Watch" | "Strain" | "Crisis";
export type Tone = "info" | "success" | "warning" | "danger";
export type GamePhase = "running" | "won" | "lost";
export type SimulationSpeed = 0 | 1 | 2 | 3;

export interface GridPoint {
  x: number;
  y: number;
}

export interface Tile {
  terrain: TerrainType;
  road: boolean;
  fixed: boolean;
  entryRoad: boolean;
  zone: ZoneType | null;
  structure: StructureType | null;
  development: number;
  appeal: number;
  variant: number;
}

export interface CoverageState {
  utilityRatio: number;
  parkRatio: number;
  transitRatio: number;
  employmentRatio: number;
  congestionRatio: number;
  pollutionRatio: number;
  connectedLotRatio: number;
}

export interface DemandState {
  residential: number;
  commercial: number;
  industrial: number;
}

export interface DailyEconomy {
  income: number;
  upkeep: number;
  policyUpkeep: number;
  net: number;
}

export interface IncidentForecast {
  id: IncidentId;
  title: string;
  summary: string;
  effectSummary: string;
  mitigation: string;
  tone: Tone;
  severity: number;
}

export interface ActiveIncident extends IncidentForecast {
  startedDay: number;
  daysActive: number;
}

export interface CityMetrics {
  population: number;
  jobs: number;
  availableWorkers: number;
  roadCount: number;
  connectedLots: number;
  developedLots: number;
  happiness: number;
  serviceScore: number;
  servicePressure: number;
  trafficScore: number;
  demand: DemandState;
  coverage: CoverageState;
  economy: DailyEconomy;
  zoneCounts: Record<ZoneType, number>;
  structureCounts: Record<StructureType, number>;
  currentStageName: string;
  milestoneProgress: number;
  incidentRisk: number;
  incidentOutlook: IncidentOutlook;
  budgetPressure: number;
}

export interface Car {
  id: number;
  path: GridPoint[];
  segmentIndex: number;
  progress: number;
  speed: number;
  color: string;
  kind: "commuter" | "freight" | "ambient";
}

export interface GameLogEntry {
  id: number;
  day: number;
  title: string;
  body: string;
  tone: Tone;
}

export interface BannerMessage {
  id: number;
  title: string;
  body: string;
  tone: Tone;
  expiresAt: number;
  persistent?: boolean;
}

export interface ActionCounters {
  playerRoads: number;
  residentialPlaced: number;
  commercialPlaced: number;
  industrialPlaced: number;
  parksPlaced: number;
  utilitiesPlaced: number;
  transitPlaced: number;
  bulldozed: number;
}

export interface GameState {
  version: number;
  scenarioId: string;
  phase: GamePhase;
  width: number;
  height: number;
  tiles: Tile[];
  timeSeconds: number;
  simulationDays: number;
  day: number;
  treasury: number;
  paused: boolean;
  speed: SimulationSpeed;
  metrics: CityMetrics;
  stageIndex: number;
  tutorialProgress: number;
  tripAccumulator: number;
  ambientAccumulator: number;
  stressTimer: number;
  warningAccumulator: number;
  nextCarId: number;
  nextLogId: number;
  banner: BannerMessage | null;
  log: GameLogEntry[];
  actions: ActionCounters;
  policies: Record<PolicyId, boolean>;
  activeIncident: ActiveIncident | null;
  incidentCooldown: number;
  cars: Car[];
}

export interface MilestoneDefinition {
  id: string;
  stageName: string;
  title: string;
  description: string;
  reward: number;
  targetPopulation: number;
  minHappiness: number;
  minTreasury: number;
  minServiceScore: number;
  minTrafficScore: number;
}

export interface TutorialObjective {
  id: string;
  title: string;
  description: string;
}

export interface ToolDefinition {
  id: ToolId;
  label: string;
  shortLabel: string;
  description: string;
  cost: number;
  accent: string;
  unlockStage?: number;
}

export interface PolicyDefinition {
  id: PolicyId;
  label: string;
  description: string;
  upkeep: number;
  accent: string;
  unlockStage: number;
}

export interface HelpSection {
  title: string;
  body: string;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  districtName: string;
  tagline: string;
  storyBeat: string;
  introHeading: string;
  introBody: string;
  prompt: string;
  layout: string[];
  startTreasury: number;
  coverageRadii: {
    utility: number;
    park: number;
    transit: number;
  };
  milestones: MilestoneDefinition[];
  tutorial: TutorialObjective[];
  helpSections: HelpSection[];
}

export interface PlacementPreview {
  allowed: boolean;
  reason: string;
  cost: number;
}

export interface PlacementResult extends PlacementPreview {
  tone: Tone;
}

export interface SavePayload {
  savedAt: string;
  state: GameState;
}

export interface UserOptions {
  musicEnabled: boolean;
  soundEnabled: boolean;
  masterVolume: number;
  reducedMotion: boolean;
}
