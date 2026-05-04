import { rehydrateGameState } from "./simulation";
import { GameState, SavePayload, UserOptions } from "./types";

const SAVE_KEY = "civicrise-save-v1";
const OPTIONS_KEY = "civicrise-options-v1";
const MAX_PERSISTED_CHARS = 1_200_000;
const VALID_TERRAINS = new Set(["land", "water", "quay"]);
const VALID_ZONES = new Set(["residential", "commercial", "industrial"]);
const VALID_STRUCTURES = new Set(["park", "utility", "transit"]);
const VALID_PHASES = new Set(["running", "won", "lost"]);
const VALID_SPEEDS = new Set([0, 1, 2, 3]);
const VALID_TONES = new Set(["info", "success", "warning", "danger"]);

const DEFAULT_OPTIONS: UserOptions = {
  musicEnabled: true,
  soundEnabled: true,
  masterVolume: 0.74,
  reducedMotion: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidGridPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isInteger(value.x) &&
    Number.isInteger(value.y)
  );
}

function isValidTile(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const terrain = value.terrain;
  const zone = value.zone;
  const structure = value.structure;

  return (
    typeof terrain === "string" &&
    VALID_TERRAINS.has(terrain) &&
    typeof value.road === "boolean" &&
    typeof value.fixed === "boolean" &&
    typeof value.entryRoad === "boolean" &&
    (zone === null || (typeof zone === "string" && VALID_ZONES.has(zone))) &&
    (structure === null || (typeof structure === "string" && VALID_STRUCTURES.has(structure))) &&
    isFiniteNumber(value.development) &&
    isFiniteNumber(value.appeal) &&
    isFiniteNumber(value.variant)
  );
}

function isValidBanner(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.tone === "string" &&
    VALID_TONES.has(value.tone) &&
    isFiniteNumber(value.expiresAt) &&
    (value.persistent === undefined || typeof value.persistent === "boolean")
  );
}

function isValidLogEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    isFiniteNumber(value.day) &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.tone === "string" &&
    VALID_TONES.has(value.tone)
  );
}

function isValidCar(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    Array.isArray(value.path) &&
    value.path.length >= 1 &&
    value.path.every(isValidGridPoint) &&
    isFiniteNumber(value.segmentIndex) &&
    isFiniteNumber(value.progress) &&
    isFiniteNumber(value.speed) &&
    typeof value.color === "string" &&
    (value.kind === "commuter" || value.kind === "freight" || value.kind === "ambient")
  );
}

function isValidSavePayload(value: unknown): value is SavePayload {
  if (!isRecord(value) || !isRecord(value.state)) {
    return false;
  }

  if (typeof value.savedAt !== "string") {
    return false;
  }

  const tiles = value.state.tiles;
  const logs = value.state.log;
  const cars = value.state.cars;

  return (
    Array.isArray(tiles) &&
    isFiniteNumber(value.state.width) &&
    isFiniteNumber(value.state.height) &&
    tiles.length === value.state.width * value.state.height &&
    tiles.every(isValidTile) &&
    typeof value.state.scenarioId === "string" &&
    typeof value.state.phase === "string" &&
    VALID_PHASES.has(value.state.phase) &&
    isFiniteNumber(value.state.speed) &&
    VALID_SPEEDS.has(value.state.speed) &&
    isFiniteNumber(value.state.day) &&
    isFiniteNumber(value.state.treasury) &&
    (!("banner" in value.state) || value.state.banner === null || isValidBanner(value.state.banner)) &&
    Array.isArray(logs) &&
    logs.every(isValidLogEntry) &&
    Array.isArray(cars) &&
    cars.every(isValidCar)
  );
}

function sanitizeOptions(raw: unknown): UserOptions {
  if (!isRecord(raw)) {
    return DEFAULT_OPTIONS;
  }

  return {
    musicEnabled: typeof raw.musicEnabled === "boolean" ? raw.musicEnabled : DEFAULT_OPTIONS.musicEnabled,
    soundEnabled: typeof raw.soundEnabled === "boolean" ? raw.soundEnabled : DEFAULT_OPTIONS.soundEnabled,
    masterVolume:
      typeof raw.masterVolume === "number" && Number.isFinite(raw.masterVolume)
        ? clamp(raw.masterVolume, 0, 1)
        : DEFAULT_OPTIONS.masterVolume,
    reducedMotion: typeof raw.reducedMotion === "boolean" ? raw.reducedMotion : DEFAULT_OPTIONS.reducedMotion,
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadSavedGame(): SavePayload | null {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(SAVE_KEY);
  if (!raw) {
    return null;
  }
  if (raw.length > MAX_PERSISTED_CHARS) {
    window.localStorage.removeItem(SAVE_KEY);
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSavePayload(parsed)) {
      window.localStorage.removeItem(SAVE_KEY);
      return null;
    }
    return {
      savedAt: parsed.savedAt,
      state: rehydrateGameState(parsed.state),
    };
  } catch {
    window.localStorage.removeItem(SAVE_KEY);
    return null;
  }
}

export function saveGame(state: GameState): SavePayload | null {
  if (!isBrowser()) {
    return null;
  }

  const payload: SavePayload = {
    savedAt: new Date().toISOString(),
    state,
  };

  window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  return payload;
}

export function clearSavedGame(): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(SAVE_KEY);
}

export function loadOptions(): UserOptions {
  if (!isBrowser()) {
    return DEFAULT_OPTIONS;
  }

  const raw = window.localStorage.getItem(OPTIONS_KEY);
  if (!raw) {
    return DEFAULT_OPTIONS;
  }
  if (raw.length > 12_000) {
    window.localStorage.removeItem(OPTIONS_KEY);
    return DEFAULT_OPTIONS;
  }

  try {
    return sanitizeOptions(JSON.parse(raw));
  } catch {
    window.localStorage.removeItem(OPTIONS_KEY);
    return DEFAULT_OPTIONS;
  }
}

export function saveOptions(options: UserOptions): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
}
