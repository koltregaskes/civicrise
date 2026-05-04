import {
  MilestoneDefinition,
  PolicyDefinition,
  PolicyId,
  ScenarioDefinition,
  ToolDefinition,
  ToolId,
} from "./types";

const northQuayMilestones: MilestoneDefinition[] = [
  {
    id: "settlement",
    stageName: "Settlement",
    title: "Civic Charter Secured",
    description:
      "The district has enough residents and confidence to secure its first charter grant.",
    reward: 8000,
    targetPopulation: 90,
    minHappiness: 55,
    minTreasury: 18000,
    minServiceScore: 46,
    minTrafficScore: 54,
  },
  {
    id: "township",
    stageName: "Township",
    title: "Quay Services Stabilised",
    description:
      "The pilot district now supports a mixed local economy and dependable civic services.",
    reward: 12000,
    targetPopulation: 220,
    minHappiness: 61,
    minTreasury: 16000,
    minServiceScore: 58,
    minTrafficScore: 58,
  },
  {
    id: "first-city",
    stageName: "First City",
    title: "First City Milestone",
    description:
      "North Quay has grown from a speculative plan into a functioning urban quarter.",
    reward: 0,
    targetPopulation: 420,
    minHappiness: 68,
    minTreasury: 10000,
    minServiceScore: 64,
    minTrafficScore: 60,
  },
];

const rivergateMilestones: MilestoneDefinition[] = [
  {
    id: "settlement",
    stageName: "Settlement",
    title: "Bridgehead Secured",
    description:
      "Rivergate has proven the first neighbourhood can hold together across the corridor network.",
    reward: 9000,
    targetPopulation: 140,
    minHappiness: 56,
    minTreasury: 26000,
    minServiceScore: 48,
    minTrafficScore: 55,
  },
  {
    id: "borough",
    stageName: "Borough",
    title: "Transit Spine Opened",
    description:
      "The district now supports enough homes, jobs, and movement capacity to function as a real borough.",
    reward: 14000,
    targetPopulation: 320,
    minHappiness: 62,
    minTreasury: 23000,
    minServiceScore: 58,
    minTrafficScore: 58,
  },
  {
    id: "city-centre",
    stageName: "City Centre",
    title: "Rivergate Core Established",
    description:
      "A dense civic core has emerged around the arterial and the waterfront edge.",
    reward: 18000,
    targetPopulation: 600,
    minHappiness: 67,
    minTreasury: 20000,
    minServiceScore: 64,
    minTrafficScore: 60,
  },
  {
    id: "metropolis",
    stageName: "Metropolis",
    title: "Metropolis Milestone",
    description:
      "Rivergate now reads as a genuine city district with layered movement, services, and urban intensity.",
    reward: 0,
    targetPopulation: 900,
    minHappiness: 72,
    minTreasury: 16000,
    minServiceScore: 68,
    minTrafficScore: 62,
  },
];

export const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  road: {
    id: "road",
    label: "Road",
    shortLabel: "R",
    description: "Extend the district spine and connect every block back to the city.",
    cost: 110,
    accent: "#8fe0ff",
  },
  residential: {
    id: "residential",
    label: "Residential",
    shortLabel: "H",
    description: "Homes for the new charter households.",
    cost: 220,
    accent: "#8fd5bf",
  },
  commercial: {
    id: "commercial",
    label: "Commercial",
    shortLabel: "C",
    description: "Street-facing jobs and local retail frontage.",
    cost: 260,
    accent: "#79c9ff",
  },
  industrial: {
    id: "industrial",
    label: "Industrial",
    shortLabel: "I",
    description: "Light logistics and workshop capacity to anchor employment.",
    cost: 330,
    accent: "#ffb868",
  },
  park: {
    id: "park",
    label: "Park",
    shortLabel: "P",
    description: "Public green relief that lifts morale around dense blocks.",
    cost: 520,
    accent: "#9df1a8",
  },
  utility: {
    id: "utility",
    label: "Utility",
    shortLabel: "U",
    description: "Compact district services that steady growth and public confidence.",
    cost: 1600,
    accent: "#ffd98d",
  },
  transit: {
    id: "transit",
    label: "Transit",
    shortLabel: "T",
    description: "Neighbourhood transit stops that cut congestion and expand urban reach.",
    cost: 950,
    accent: "#88f2ff",
    unlockStage: 1,
  },
  bulldoze: {
    id: "bulldoze",
    label: "Bulldoze",
    shortLabel: "X",
    description: "Clear a player-built tile when the plan needs correcting.",
    cost: 80,
    accent: "#ff8f8a",
  },
};

export const POLICY_DEFINITIONS: Record<PolicyId, PolicyDefinition> = {
  mixedUseIncentives: {
    id: "mixedUseIncentives",
    label: "Mixed-use incentives",
    description:
      "Boost connected housing and retail demand, trading higher daily upkeep for a faster blended district.",
    upkeep: 18,
    accent: "#8fd5bf",
    unlockStage: 1,
  },
  busPriority: {
    id: "busPriority",
    label: "Bus priority",
    description:
      "Makes transit stops stronger and peels more commuters off the road network, improving traffic flow.",
    upkeep: 22,
    accent: "#8fe0ff",
    unlockStage: 1,
  },
  greenStandards: {
    id: "greenStandards",
    label: "Green standards",
    description:
      "Cuts pollution harm and raises public confidence, while making heavy industry slightly harder to scale.",
    upkeep: 26,
    accent: "#9df1a8",
    unlockStage: 2,
  },
};

const northQuay: ScenarioDefinition = {
  id: "north-quay",
  name: "North Quay Pilot District",
  districtName: "North Quay",
  tagline:
    "Turn an underused waterfront edge into a compact, solvent civic district.",
  storyBeat:
    "The charter board has one review window to prove that dense housing, mixed jobs, and disciplined infrastructure can coexist without flattening the district's public realm.",
  introHeading: "Pilot the first Civicrise district",
  introBody:
    "North Quay sits between a live arterial and an empty waterfront edge. The job is not to sprawl. It is to stitch together one believable neighbourhood with zoning discipline, clear roads, visible traffic, and enough civic confidence to earn the city's first milestone.",
  prompt:
    "Create a connected district that reaches the First City milestone without running the treasury into collapse.",
  layout: [
    "~~~p.....=......",
    "~~pp.....=......",
    "~pp......=......",
    "pp.......=......",
    "p........=......",
    "p........=......",
    "p....===========",
    "p........=......",
    "p........=......",
    "pp..=....=......",
    "~pp.=....=......",
    "~~p......=......",
  ],
  startTreasury: 52000,
  coverageRadii: {
    utility: 3,
    park: 2,
    transit: 4,
  },
  milestones: northQuayMilestones,
  tutorial: [
    {
      id: "roads",
      title: "Lay the district spine",
      description: "Add at least 8 new road tiles off the fixed boulevard.",
    },
    {
      id: "zoning",
      title: "Establish mixed zoning",
      description: "Place 6 residential lots and 3 commercial lots.",
    },
    {
      id: "growth",
      title: "Reach a working settlement",
      description: "Grow beyond 120 residents while keeping the treasury above 42000.",
    },
    {
      id: "services",
      title: "Support the pressure curve",
      description:
        "Place at least 1 utility tile and 2 industrial lots away from homes to steady jobs and services.",
    },
    {
      id: "public-realm",
      title: "Earn the civic review",
      description: "Add a park and then reach the First City milestone.",
    },
  ],
  helpSections: [
    {
      title: "Zoning",
      body:
        "Residential lots create population. Commercial and industrial lots create jobs. Every zone needs road access to the connected city network before it can grow into a functioning block.",
    },
    {
      title: "Money",
      body:
        "Treasury rises through population and productive jobs. Roads, parks, transit, and utilities all carry upkeep, so overbuilding too early can sink the district before tax income catches up.",
    },
    {
      title: "Traffic",
      body:
        "Cars only move on roads that connect back to the fixed city spine. Transit stops unlock after Settlement and can take pressure off the road network once the district gets busier.",
    },
    {
      title: "Planning layers",
      body:
        "Milestones now unlock the next planning layer. Settlement opens transit and the first policy set. Township opens stronger civic policies for a cleaner, more resilient district.",
    },
    {
      title: "Civic crises",
      body:
        "If utility coverage, parks, or traffic discipline fall behind growth, the district can trigger short-term crises such as grid strain, junction lock, or waterfront surge. The cure is usually better coverage rather than waiting them out.",
    },
    {
      title: "District pattern",
      body:
        "North Quay is easiest to stabilise when homes and shops cluster off the upper-left road extension, industry sits farther east beside the fixed boulevard, and parks buffer the residential edge.",
    },
    {
      title: "Service pressure",
      body:
        "Service pressure is the inverse of district support. Utility coverage, parks, transit, and local jobs reduce pressure. Congestion, disconnected lots, and pollution push pressure upward.",
    },
  ],
};

const rivergate: ScenarioDefinition = {
  id: "rivergate",
  name: "Rivergate Expansion",
  districtName: "Rivergate",
  tagline:
    "Grow a longer corridor city with layered movement, bigger services, and a true metropolis arc.",
  storyBeat:
    "Rivergate begins as a stretched waterfront corridor, but the board expects more than a tidy pilot. This district has to prove Civicrise can scale into a city with multiple growth fronts, transit planning, and policy tradeoffs.",
  introHeading: "Scale beyond the pilot district",
  introBody:
    "Rivergate runs longer than North Quay, with a cross-district arterial and room for a real civic core. You will need mixed growth, multiple service anchors, transit, and policy decisions to keep the larger district from choking on its own success.",
  prompt:
    "Build Rivergate from a bridgehead settlement into a metropolis by layering growth, transit, and policy without losing traffic control.",
  layout: [
    "~~~~p.....=.......",
    "~~~pp.....=.......",
    "~~pp......=..=....",
    "~pp.......=..=....",
    "pp........=..=....",
    "p....===========..",
    "p........=..=.....",
    "p........=..=.....",
    "pp.......=..=.....",
    "~pp......=..=.....",
    "~~pp.....=..=.....",
    "~~~p.....=..=.....",
    "~~~~p....=..=.....",
    "~~~~p....=........",
  ],
  startTreasury: 78000,
  coverageRadii: {
    utility: 4,
    park: 3,
    transit: 5,
  },
  milestones: rivergateMilestones,
  tutorial: [
    {
      id: "corridors",
      title: "Open the growth corridors",
      description: "Add at least 12 roads off the fixed spine so Rivergate can grow on both branches.",
    },
    {
      id: "districts",
      title: "Zone twin neighbourhoods",
      description: "Place 10 residential lots, 5 commercial lots, and 3 industrial lots.",
    },
    {
      id: "services",
      title: "Build real civic support",
      description: "Place at least 2 utilities and 2 parks to support the longer district.",
    },
    {
      id: "movement",
      title: "Layer transport and policy",
      description: "Place 2 transit stops and activate at least 1 unlocked policy.",
    },
    {
      id: "metropolis",
      title: "Reach metropolis review",
      description: "Push Rivergate all the way to the Metropolis milestone.",
    },
  ],
  helpSections: [
    {
      title: "Scale",
      body:
        "Rivergate is long enough that one service core is not enough. Expect to duplicate utilities, parks, and transport support as density spreads.",
    },
    {
      title: "Transit",
      body:
        "Transit stops work best when they sit along the main road spine and near clusters of homes and shops. Bus priority makes each stop carry more of the district's movement load.",
    },
    {
      title: "Policies",
      body:
        "Mixed-use incentives accelerate blended growth, bus priority improves transport efficiency, and green standards reduce pollution damage once the district gets dense.",
    },
    {
      title: "Crises",
      body:
        "Rivergate can now throw larger district-wide disruptions once it densifies. Watch the resilience readout and respond quickly with utilities, parks, transit, and policy support before a watch turns into a crisis.",
    },
    {
      title: "Traffic and form",
      body:
        "Because Rivergate is wider and deeper, spread growth across both corridors. If every trip funnels through one branch, congestion will outrun your milestone gains.",
    },
    {
      title: "Metropolis arc",
      body:
        "The larger scenario is meant to prove the game can grow beyond the first review demo. Use it to test layered planning rather than a single solved layout.",
    },
  ],
};

export const DEFAULT_SCENARIO_ID = northQuay.id;

export const SCENARIOS: ScenarioDefinition[] = [northQuay, rivergate];

export function getScenario(id: string): ScenarioDefinition {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? northQuay;
}
