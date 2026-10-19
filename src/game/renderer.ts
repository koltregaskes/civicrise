import { getScenario } from "./scenario";
import { evaluatePlacement, getTile } from "./simulation";
import {
  drawTile as drawTilesetTile,
  getTile as getTilesetTile,
  loadTileset,
  pickRoadTile,
} from "./tileset";
import { GameState, GridPoint, ToolId } from "./types";

const TILE_WIDTH = 78;
const TILE_HEIGHT = 40;

interface Viewport {
  scale: number;
  originX: number;
  originY: number;
}

interface RenderOptions {
  hoveredTile: GridPoint | null;
  selectedTool: ToolId;
  reducedMotion: boolean;
  timeMs: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const TILE_ORDER_CACHE = new Map<string, GridPoint[]>();

/** World-space room kept above the back corner of the map for the tallest buildings and smoke. */
const MAP_HEADROOM = 48;
/** Thickness of the tile slab under the front corner of the map (15 source px of a Kenney tile). */
const MAP_SLAB_DEPTH = 12;
/** Share of the canvas the map may fill along its tighter axis. */
const MAP_FIT = 0.94;
const MAX_SCALE = 1.6;

/**
 * Fits the whole isometric board to the canvas and centres it. The board's screen bounds are
 * worked out from the grid size: left and right corners come from the two grid edges, the top
 * from the back corner plus building headroom, and the bottom from the front corner plus the slab.
 */
function getViewport(state: GameState, width: number, height: number): Viewport {
  const span = state.width + state.height;
  const worldWidth = span * (TILE_WIDTH / 2);
  const top = -TILE_HEIGHT / 2 - MAP_HEADROOM;
  const bottom = (span - 1) * (TILE_HEIGHT / 2) + MAP_SLAB_DEPTH;
  const scale = Math.max(
    0.05,
    Math.min((width * MAP_FIT) / worldWidth, (height * MAP_FIT) / (bottom - top), MAX_SCALE),
  );
  const centreX = (state.width - state.height) * (TILE_WIDTH / 4);
  const centreY = (top + bottom) / 2;

  return {
    scale,
    originX: width / 2 - centreX * scale,
    originY: height / 2 - centreY * scale,
  };
}

function tileToScreen(point: GridPoint, viewport: Viewport): ScreenPoint {
  return {
    x: viewport.originX + (point.x - point.y) * (TILE_WIDTH / 2) * viewport.scale,
    y: viewport.originY + (point.x + point.y) * (TILE_HEIGHT / 2) * viewport.scale,
  };
}

function getSortedTiles(state: Pick<GameState, "width" | "height">): GridPoint[] {
  const key = `${state.width}x${state.height}`;
  const cached = TILE_ORDER_CACHE.get(key);
  if (cached) {
    return cached;
  }

  const tiles: GridPoint[] = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      tiles.push({ x, y });
    }
  }

  tiles.sort((a, b) => a.x + a.y - (b.x + b.y));
  TILE_ORDER_CACHE.set(key, tiles);
  return tiles;
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
): void {
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - halfHeight);
  ctx.lineTo(centerX + halfWidth, centerY);
  ctx.lineTo(centerX, centerY + halfHeight);
  ctx.lineTo(centerX - halfWidth, centerY);
  ctx.closePath();
}

function drawExtrudedDiamond(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baseY: number,
  halfWidth: number,
  halfHeight: number,
  height: number,
  topColor: string,
  leftColor: string,
  rightColor: string,
): void {
  const top = { x: centerX, y: baseY - halfHeight - height };
  const right = { x: centerX + halfWidth, y: baseY - height };
  const bottom = { x: centerX, y: baseY + halfHeight - height };
  const left = { x: centerX - halfWidth, y: baseY - height };

  const baseRight = { x: centerX + halfWidth, y: baseY };
  const baseBottom = { x: centerX, y: baseY + halfHeight };
  const baseLeft = { x: centerX - halfWidth, y: baseY };

  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(baseBottom.x, baseBottom.y);
  ctx.lineTo(baseLeft.x, baseLeft.y);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(right.x, right.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(baseBottom.x, baseBottom.y);
  ctx.lineTo(baseRight.x, baseRight.y);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#061320");
  gradient.addColorStop(0.48, "#0d2232");
  gradient.addColorStop(1, "#08111f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const pulse = reducedMotion ? 0 : Math.sin(timeMs * 0.0004) * 18;
  const glow = ctx.createRadialGradient(width * 0.2, height * 0.14, 0, width * 0.2, height * 0.14, width * 0.5);
  glow.addColorStop(0, "rgba(89, 165, 217, 0.18)");
  glow.addColorStop(1, "rgba(89, 165, 217, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = `rgba(143, 224, 255, ${0.05 + pulse / 500})`;
  for (let i = -height; i < width; i += 54) {
    ctx.fillRect(i, 0, 1, height);
  }

  ctx.strokeStyle = "rgba(131, 172, 201, 0.08)";
  ctx.lineWidth = 1;
  for (let row = 0; row < height; row += 42) {
    ctx.beginPath();
    ctx.moveTo(0, row);
    ctx.lineTo(width, row);
    ctx.stroke();
  }
}

/**
 * Soft drop shadow under the board itself. It replaces the old fixed ellipse, which sat at a set
 * share of the canvas and showed up as a stray dark disc whenever the board was elsewhere.
 */
function drawBoardShadow(ctx: CanvasRenderingContext2D, state: GameState, viewport: Viewport): void {
  const back = tileToScreen({ x: 0, y: 0 }, viewport);
  const right = tileToScreen({ x: state.width - 1, y: 0 }, viewport);
  const front = tileToScreen({ x: state.width - 1, y: state.height - 1 }, viewport);
  const left = tileToScreen({ x: 0, y: state.height - 1 }, viewport);
  const halfWidth = (TILE_WIDTH / 2) * viewport.scale;
  const halfHeight = (TILE_HEIGHT / 2) * viewport.scale;
  const drop = MAP_SLAB_DEPTH * viewport.scale;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 36 * viewport.scale;
  ctx.shadowOffsetY = 14 * viewport.scale;
  ctx.fillStyle = "#08131d";
  ctx.beginPath();
  ctx.moveTo(back.x, back.y - halfHeight);
  ctx.lineTo(right.x + halfWidth, right.y);
  ctx.lineTo(right.x + halfWidth, right.y + drop);
  ctx.lineTo(front.x, front.y + halfHeight + drop);
  ctx.lineTo(left.x - halfWidth, left.y + drop);
  ctx.lineTo(left.x - halfWidth, left.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawIncidentAtmosphere(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: GameState,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const incident = state.activeIncident;
  if (!incident) {
    return;
  }

  if (incident.id === "heatwave") {
    const haze = ctx.createLinearGradient(0, 0, width, height);
    haze.addColorStop(0, "rgba(255, 180, 110, 0.12)");
    haze.addColorStop(1, "rgba(255, 118, 77, 0.08)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 220, 175, 0.08)";
    for (let row = 80; row < height; row += 56) {
      const drift = reducedMotion ? 0 : Math.sin(timeMs * 0.0012 + row * 0.03) * 14;
      ctx.beginPath();
      ctx.moveTo(0, row + drift);
      ctx.lineTo(width, row - drift);
      ctx.stroke();
    }
    return;
  }

  if (incident.id === "riverSurge") {
    const sweep = reducedMotion ? 0 : Math.sin(timeMs * 0.001) * 20;
    const surge = ctx.createLinearGradient(0, 0, width * 0.5 + sweep, height * 0.42 + sweep);
    surge.addColorStop(0, "rgba(110, 209, 255, 0.16)");
    surge.addColorStop(1, "rgba(110, 209, 255, 0)");
    ctx.fillStyle = surge;
    ctx.fillRect(0, 0, width * 0.56, height * 0.5);
    return;
  }

  if (incident.id === "gridStrain") {
    ctx.strokeStyle = "rgba(255, 201, 124, 0.08)";
    for (let offset = -height; offset < width; offset += 42) {
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + height, height);
      ctx.stroke();
    }
    return;
  }

  if (incident.id === "junctionLock") {
    const lock = ctx.createLinearGradient(0, height * 0.5, width, height);
    lock.addColorStop(0, "rgba(255, 138, 118, 0)");
    lock.addColorStop(1, "rgba(255, 138, 118, 0.1)");
    ctx.fillStyle = lock;
    ctx.fillRect(0, height * 0.5, width, height * 0.5);
  }
}

/** The road piece that matches this tile's connected neighbours, or null before the art loads. */
function getRoadArt(state: GameState, point: GridPoint): HTMLImageElement | null {
  const isRoad = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < state.width && y < state.height && getTile(state, x, y).road;
  return getTilesetTile(
    pickRoadTile(
      isRoad(point.x, point.y - 1),
      isRoad(point.x + 1, point.y),
      isRoad(point.x, point.y + 1),
      isRoad(point.x - 1, point.y),
    ),
  );
}

function drawTerrain(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  point: GridPoint,
  screen: ScreenPoint,
  viewport: Viewport,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const tile = getTile(state, point.x, point.y);
  const halfWidth = (TILE_WIDTH / 2) * viewport.scale;
  const halfHeight = (TILE_HEIGHT / 2) * viewport.scale;

  // Real isometric tile art when the tileset has loaded; vector drawing otherwise. Road pieces are
  // drawn here, in the same back-to-front pass as the ground, so each tile's slab edge is covered by
  // the tiles in front of it. Drawing them in a later pass laid their brown slab edges over the
  // ground in front, which boxed every road tile in on its own.
  const art = tile.road ? getRoadArt(state, point) : getTilesetTile(
    tile.terrain === "water" ? "water" : tile.terrain === "quay" ? "dirt" : "grass",
  );
  if (art) {
    drawTilesetTile(ctx, art, screen.x, screen.y, halfWidth * 2, halfHeight * 2);
    return;
  }

  drawDiamond(ctx, screen.x, screen.y, halfWidth, halfHeight);

  if (tile.terrain === "water") {
    const gradient = ctx.createLinearGradient(screen.x, screen.y - halfHeight, screen.x, screen.y + halfHeight);
    gradient.addColorStop(0, "#24597d");
    gradient.addColorStop(1, "#0f2940");
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = "rgba(166, 226, 255, 0.24)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const shimmer = reducedMotion ? 0 : Math.sin(timeMs * 0.0015 + point.x * 0.7 + point.y * 0.6) * 3;
    ctx.strokeStyle = "rgba(196, 240, 255, 0.14)";
    ctx.beginPath();
    ctx.moveTo(screen.x - halfWidth * 0.45, screen.y + shimmer);
    ctx.lineTo(screen.x + halfWidth * 0.35, screen.y - shimmer);
    ctx.stroke();
    return;
  }

  if (tile.terrain === "quay") {
    const gradient = ctx.createLinearGradient(screen.x, screen.y - halfHeight, screen.x, screen.y + halfHeight);
    gradient.addColorStop(0, "#73879a");
    gradient.addColorStop(1, "#3d4d5b");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(225, 241, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = "rgba(250, 250, 255, 0.18)";
    ctx.beginPath();
    ctx.moveTo(screen.x - halfWidth * 0.5, screen.y + halfHeight * 0.15);
    ctx.lineTo(screen.x + halfWidth * 0.5, screen.y - halfHeight * 0.15);
    ctx.stroke();
    return;
  }

  const baseGradient = ctx.createLinearGradient(screen.x, screen.y - halfHeight, screen.x, screen.y + halfHeight);
  const hueShift = tile.variant * 4;
  baseGradient.addColorStop(0, `hsl(${196 + hueShift}deg 31% 35%)`);
  baseGradient.addColorStop(1, `hsl(${198 + hueShift}deg 32% 24%)`);
  ctx.fillStyle = baseGradient;
  ctx.fill();

  ctx.strokeStyle = "rgba(198, 227, 247, 0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawRoad(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  point: GridPoint,
  screen: ScreenPoint,
  viewport: Viewport,
): void {
  const tile = getTile(state, point.x, point.y);
  if (!tile.road) {
    return;
  }

  // With the tileset loaded the road piece was already drawn in the terrain pass.
  if (getRoadArt(state, point)) {
    return;
  }

  const halfWidth = (TILE_WIDTH / 2) * viewport.scale * 0.92;
  const halfHeight = (TILE_HEIGHT / 2) * viewport.scale * 0.92;
  drawDiamond(ctx, screen.x, screen.y, halfWidth, halfHeight);
  ctx.fillStyle = tile.fixed ? "#213549" : "#1a2736";
  ctx.fill();

  ctx.strokeStyle = tile.entryRoad ? "rgba(147, 223, 255, 0.46)" : "rgba(248, 243, 221, 0.14)";
  ctx.lineWidth = tile.entryRoad ? 1.6 : 1;
  ctx.stroke();

  const centerLineTargets = [
    { x: point.x, y: point.y - 1, targetX: screen.x, targetY: screen.y - halfHeight },
    { x: point.x + 1, y: point.y, targetX: screen.x + halfWidth, targetY: screen.y },
    { x: point.x, y: point.y + 1, targetX: screen.x, targetY: screen.y + halfHeight },
    { x: point.x - 1, y: point.y, targetX: screen.x - halfWidth, targetY: screen.y },
  ];

  ctx.strokeStyle = "rgba(244, 231, 169, 0.28)";
  ctx.lineWidth = 1;
  centerLineTargets.forEach((candidate) => {
    if (candidate.x < 0 || candidate.y < 0 || candidate.x >= state.width || candidate.y >= state.height) {
      return;
    }
    if (!getTile(state, candidate.x, candidate.y).road) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(candidate.targetX, candidate.targetY);
    ctx.stroke();
  });
}

function drawZoneLot(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  point: GridPoint,
  screen: ScreenPoint,
  viewport: Viewport,
): void {
  const tile = getTile(state, point.x, point.y);
  const halfWidth = (TILE_WIDTH / 2) * viewport.scale * 0.84;
  const halfHeight = (TILE_HEIGHT / 2) * viewport.scale * 0.84;

  if (tile.zone && tile.development < 20) {
    const zoneColors: Record<NonNullable<typeof tile.zone>, string> = {
      residential: "rgba(143, 213, 191, 0.58)",
      commercial: "rgba(121, 201, 255, 0.58)",
      industrial: "rgba(255, 184, 104, 0.52)",
    };
    drawDiamond(ctx, screen.x, screen.y, halfWidth, halfHeight);
    ctx.fillStyle = zoneColors[tile.zone];
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

type TileData = ReturnType<typeof getTile>;

/** Stable 0..1 value per tile, so each lot keeps its look from frame to frame. */
function lotHash(point: GridPoint, salt: number): number {
  const value = Math.sin(point.x * 127.1 + point.y * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function developmentTier(tile: TileData): number {
  return tile.development < 18 ? 0 : tile.development < 44 ? 1 : tile.development < 74 ? 2 : 3;
}

interface Tones {
  top: string;
  left: string;
  right: string;
}

/**
 * Adds a grid of windows to the two visible walls of a box drawn by drawExtrudedDiamond.
 * Window positions are found in wall space (u along the wall, v down from the eaves), so they
 * follow the isometric slant. Each colour is filled as one path to keep the draw count low.
 */
function drawWallWindows(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baseY: number,
  halfWidth: number,
  halfHeight: number,
  height: number,
  rows: number,
  cols: number,
  point: GridPoint,
  glass: string,
  lit: string,
  litShare: number,
  top = 0.14,
  bottom = 0.1,
): void {
  if (rows <= 0 || cols <= 0) {
    return;
  }

  const leftWall = (u: number, v: number): ScreenPoint => ({
    x: centerX - halfWidth + u * halfWidth,
    y: baseY - height + u * halfHeight + v * height,
  });
  const rightWall = (u: number, v: number): ScreenPoint => ({
    x: centerX + u * halfWidth,
    y: baseY + halfHeight - height - u * halfHeight + v * height,
  });

  const paths = { glass: new Path2D(), lit: new Path2D() };
  const rowSpan = (1 - top - bottom) / rows;
  const colSpan = 0.84 / cols;

  [leftWall, rightWall].forEach((wall, wallIndex) => {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const u0 = 0.08 + col * colSpan + colSpan * 0.18;
        const u1 = 0.08 + (col + 1) * colSpan - colSpan * 0.18;
        const v0 = top + row * rowSpan + rowSpan * 0.2;
        const v1 = top + (row + 1) * rowSpan - rowSpan * 0.18;
        const a = wall(u0, v0);
        const b = wall(u1, v0);
        const c = wall(u1, v1);
        const d = wall(u0, v1);
        const target = lotHash(point, 11 + wallIndex * 31 + row * 7 + col * 3) < litShare ? paths.lit : paths.glass;
        target.moveTo(a.x, a.y);
        target.lineTo(b.x, b.y);
        target.lineTo(c.x, c.y);
        target.lineTo(d.x, d.y);
        target.closePath();
      }
    }
  });

  ctx.fillStyle = glass;
  ctx.fill(paths.glass);
  ctx.fillStyle = lit;
  ctx.fill(paths.lit);
}

/**
 * Gable roof on a box whose top face is centred on (centerX, topY). The ridge runs from the
 * up-left edge to the down-right edge, so the front-left slope and the down-right gable end
 * face the viewer.
 */
function drawGableRoof(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  halfWidth: number,
  halfHeight: number,
  rise: number,
  slopeLight: string,
  slopeDark: string,
  gable: string,
): void {
  const overhang = 1.12;
  const hw = halfWidth * overhang;
  const hh = halfHeight * overhang;
  const t = { x: centerX, y: topY - hh };
  const r = { x: centerX + hw, y: topY };
  const b = { x: centerX, y: topY + hh };
  const l = { x: centerX - hw, y: topY };
  const ridgeBack = { x: (t.x + l.x) / 2, y: (t.y + l.y) / 2 - rise };
  const ridgeFront = { x: (r.x + b.x) / 2, y: (r.y + b.y) / 2 - rise };

  ctx.fillStyle = slopeLight;
  ctx.beginPath();
  ctx.moveTo(t.x, t.y);
  ctx.lineTo(r.x, r.y);
  ctx.lineTo(ridgeFront.x, ridgeFront.y);
  ctx.lineTo(ridgeBack.x, ridgeBack.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = gable;
  ctx.beginPath();
  ctx.moveTo(r.x - (hw - halfWidth), r.y + (hh - halfHeight) * 0.2);
  ctx.lineTo(b.x, b.y - (hh - halfHeight));
  ctx.lineTo(ridgeFront.x, ridgeFront.y + rise * 0.12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = slopeDark;
  ctx.beginPath();
  ctx.moveTo(l.x, l.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(ridgeFront.x, ridgeFront.y);
  ctx.lineTo(ridgeBack.x, ridgeBack.y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ridgeBack.x, ridgeBack.y);
  ctx.lineTo(ridgeFront.x, ridgeFront.y);
  ctx.stroke();
}

const HOUSE_WALLS: Tones[] = [
  { top: "#f3eadb", left: "#c9b89c", right: "#e4d6bd" },
  { top: "#eef1e6", left: "#b9c4ae", right: "#d7e0cb" },
  { top: "#f2ddd0", left: "#c49f8a", right: "#e0bfaa" },
  { top: "#e3e9ef", left: "#a9b6c2", right: "#c9d4de" },
];
const HOUSE_ROOFS = [
  { light: "#c9694d", dark: "#9a4a35" },
  { light: "#5f6f80", dark: "#45525f" },
  { light: "#8d5a3c", dark: "#6a412b" },
  { light: "#4f7a6a", dark: "#3a5b4f" },
];

function drawHouse(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baseY: number,
  scale: number,
  point: GridPoint,
  salt: number,
  size: number,
): void {
  const walls = HOUSE_WALLS[Math.floor(lotHash(point, salt) * HOUSE_WALLS.length)];
  const roof = HOUSE_ROOFS[Math.floor(lotHash(point, salt + 1) * HOUSE_ROOFS.length)];
  const hw = 11 * size * scale;
  const hh = 6 * size * scale;
  const h = (10 + lotHash(point, salt + 2) * 4) * size * scale;

  drawExtrudedDiamond(ctx, centerX, baseY, hw, hh, h, walls.top, walls.left, walls.right);
  // Upstairs windows on both walls, and a front door low in the middle of the right-hand wall.
  drawWallWindows(ctx, centerX, baseY, hw, hh, h, 1, 2, point, "rgba(44, 70, 92, 0.85)", "#ffe3a1", 0.35, 0.16, 0.5);
  const doorHalf = 0.09;
  const doorPoint = (u: number, v: number): ScreenPoint => ({
    x: centerX + u * hw,
    y: baseY + hh - h - u * hh + v * h,
  });
  const d0 = doorPoint(0.5 - doorHalf, 0.55);
  const d1 = doorPoint(0.5 + doorHalf, 0.55);
  const d2 = doorPoint(0.5 + doorHalf, 1);
  const d3 = doorPoint(0.5 - doorHalf, 1);
  ctx.fillStyle = "rgba(78, 52, 38, 0.92)";
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.lineTo(d3.x, d3.y);
  ctx.closePath();
  ctx.fill();
  drawGableRoof(ctx, centerX, baseY - h, hw, hh, 8 * size * scale, roof.light, roof.dark, walls.right);
}

function drawResidential(
  ctx: CanvasRenderingContext2D,
  tile: TileData,
  point: GridPoint,
  screen: ScreenPoint,
  viewport: Viewport,
): void {
  const tier = developmentTier(tile);
  if (tier === 0) {
    return;
  }

  const s = viewport.scale;

  if (tier === 1) {
    // A single house with a garden hedge.
    ctx.fillStyle = "#4f8d55";
    drawDiamond(ctx, screen.x + 9 * s, screen.y + 6 * s, 9 * s, 4.5 * s);
    ctx.fill();
    drawHouse(ctx, screen.x - 4 * s, screen.y + 1 * s, s, point, 1, 1);
    return;
  }

  if (tier === 2) {
    // A pair of terraced houses, back one first.
    drawHouse(ctx, screen.x - 9 * s, screen.y - 3 * s, s, point, 1, 0.9);
    drawHouse(ctx, screen.x + 8 * s, screen.y + 4 * s, s, point, 5, 0.95);
    return;
  }

  // Tier 3: a flat block with balconies, windows and a rooftop plant room.
  const walls = HOUSE_WALLS[Math.floor(lotHash(point, 3) * HOUSE_WALLS.length)];
  const hw = 18 * s;
  const hh = 9.5 * s;
  const floors = 3 + Math.floor(lotHash(point, 4) * 3);
  const h = (8 + floors * 8) * s;
  drawExtrudedDiamond(ctx, screen.x, screen.y + 2 * s, hw, hh, h, walls.top, walls.left, walls.right);
  drawWallWindows(ctx, screen.x, screen.y + 2 * s, hw, hh, h, floors, 3, point, "rgba(40, 66, 88, 0.88)", "#ffe0a0", 0.3);
  // Parapet and plant room.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;
  drawDiamond(ctx, screen.x, screen.y + 2 * s - h, hw * 0.92, hh * 0.92);
  ctx.stroke();
  drawExtrudedDiamond(ctx, screen.x - 5 * s, screen.y + 2 * s - h, 5 * s, 3 * s, 4 * s, "#cfd6dc", "#8d99a3", "#aab5be");
}

const GLASS_TONES: Array<Tones & { glass: string; lit: string }> = [
  { top: "#c5efff", left: "#5f97b3", right: "#86bfdc", glass: "rgba(22, 52, 74, 0.72)", lit: "#d9f6ff" },
  { top: "#cfe0ff", left: "#6680b8", right: "#8aa3d8", glass: "rgba(26, 36, 78, 0.7)", lit: "#e3ecff" },
  { top: "#c9f2e6", left: "#5a9f8c", right: "#7fc4b1", glass: "rgba(18, 60, 52, 0.72)", lit: "#e0fff6" },
  { top: "#efe4d2", left: "#a68f6e", right: "#c8b08c", glass: "rgba(52, 44, 34, 0.7)", lit: "#ffe7b8" },
];
const AWNINGS = ["#ff9f80", "#8fd5bf", "#ffcb7c", "#8fe0ff"];

function drawCommercial(
  ctx: CanvasRenderingContext2D,
  tile: TileData,
  point: GridPoint,
  screen: ScreenPoint,
  viewport: Viewport,
): void {
  const tier = developmentTier(tile);
  if (tier === 0) {
    return;
  }

  const s = viewport.scale;
  const tones = GLASS_TONES[Math.floor(lotHash(point, 7) * GLASS_TONES.length)];
  const baseY = screen.y + 1 * s;

  if (tier === 1) {
    // Corner shop: low unit, shopfront glazing and a striped awning on the street side.
    const hw = 16 * s;
    const hh = 8.5 * s;
    const h = 13 * s;
    drawExtrudedDiamond(ctx, screen.x, baseY, hw, hh, h, "#e9edf0", "#a7b2bb", "#c7d0d7");
    drawWallWindows(ctx, screen.x, baseY, hw, hh, h, 1, 3, point, tones.glass, tones.lit, 0.5);
    const awning = AWNINGS[Math.floor(lotHash(point, 8) * AWNINGS.length)];
    ctx.fillStyle = awning;
    ctx.beginPath();
    ctx.moveTo(screen.x, baseY + hh - h * 0.62);
    ctx.lineTo(screen.x + hw, baseY - h * 0.62);
    ctx.lineTo(screen.x + hw + 2.5 * s, baseY - h * 0.62 + 3 * s);
    ctx.lineTo(screen.x + 2.5 * s, baseY + hh - h * 0.62 + 3 * s);
    ctx.closePath();
    ctx.fill();
    return;
  }

  // Offices (tier 2) and towers with a set-back crown (tier 3).
  const hw = 16 * s;
  const hh = 9 * s;
  const floors = tier === 2 ? 4 : 6 + Math.floor(lotHash(point, 9) * 3);
  const h = (6 + floors * 7) * s;
  drawExtrudedDiamond(ctx, screen.x, baseY, hw, hh, h, tones.top, tones.left, tones.right);
  drawWallWindows(ctx, screen.x, baseY, hw, hh, h, floors, 3, point, tones.glass, tones.lit, 0.28);

  if (tier === 3) {
    const crownH = 9 * s;
    drawExtrudedDiamond(ctx, screen.x, baseY - h, hw * 0.62, hh * 0.62, crownH, tones.top, tones.left, tones.right);
    drawWallWindows(ctx, screen.x, baseY - h, hw * 0.62, hh * 0.62, crownH, 1, 2, point, tones.glass, tones.lit, 0.5);
    ctx.strokeStyle = "rgba(230, 244, 255, 0.8)";
    ctx.lineWidth = Math.max(1, s);
    ctx.beginPath();
    ctx.moveTo(screen.x, baseY - h - crownH);
    ctx.lineTo(screen.x, baseY - h - crownH - 12 * s);
    ctx.stroke();
  } else {
    drawExtrudedDiamond(ctx, screen.x + 5 * s, baseY - h, 4 * s, 2.5 * s, 3 * s, "#d7dee4", "#8c98a2", "#adb8c1");
  }
}

const FACTORY_TONES: Tones[] = [
  { top: "#d4b38d", left: "#8d6b48", right: "#b0885d" },
  { top: "#c9ccd0", left: "#7f868d", right: "#a2a9b0" },
  { top: "#d8a48c", left: "#8e5845", right: "#b87460" },
];

function drawIndustrial(
  ctx: CanvasRenderingContext2D,
  tile: TileData,
  point: GridPoint,
  screen: ScreenPoint,
  viewport: Viewport,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const tier = developmentTier(tile);
  if (tier === 0) {
    return;
  }

  const s = viewport.scale;
  const tones = FACTORY_TONES[Math.floor(lotHash(point, 13) * FACTORY_TONES.length)];
  const hallX = screen.x - 5 * s;
  const hallY = screen.y + 3 * s;
  const hw = 17 * s;
  const hh = 9.5 * s;
  const h = (10 + tier * 4) * s;

  // Chimney sits behind the hall, so it is drawn first.
  const chimneyX = screen.x + 10 * s;
  const chimneyY = screen.y - 4 * s;
  const chimneyH = (24 + tier * 7) * s;
  drawExtrudedDiamond(ctx, chimneyX, chimneyY, 3.6 * s, 2 * s, chimneyH, "#e7e2dc", "#9b8f84", "#c2b7ac");
  ctx.fillStyle = "#c8553d";
  ctx.fillRect(chimneyX - 3.6 * s, chimneyY - chimneyH + 3 * s, 7.2 * s, 3 * s);

  drawExtrudedDiamond(ctx, hallX, hallY, hw, hh, h, tones.top, tones.left, tones.right);
  drawWallWindows(ctx, hallX, hallY, hw, hh, h, 1, 4, point, "rgba(40, 52, 60, 0.75)", "#ffd38a", 0.25);

  // Sawtooth roof: a row of small gables along the hall.
  const teeth = 3;
  for (let i = 0; i < teeth; i += 1) {
    const t = (i + 0.5) / teeth - 0.5;
    drawGableRoof(
      ctx,
      hallX + t * hw * 1.1,
      hallY - h - t * hh * 1.1 * -1,
      hw / teeth,
      hh * 0.9,
      4 * s,
      "#e9eef2",
      "#7d8a96",
      tones.right,
    );
  }

  const smokeOffset = reducedMotion ? 0 : Math.sin(timeMs * 0.002 + tile.variant) * 3;
  ctx.fillStyle = "rgba(217, 227, 233, 0.2)";
  ctx.beginPath();
  ctx.arc(chimneyX + 2 * s, chimneyY - chimneyH - 7 * s + smokeOffset, 6 * s, 0, Math.PI * 2);
  ctx.arc(chimneyX + 8 * s, chimneyY - chimneyH - 13 * s + smokeOffset * 1.4, 4.5 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawPark(ctx: CanvasRenderingContext2D, point: GridPoint, screen: ScreenPoint, viewport: Viewport): void {
  const s = viewport.scale;
  drawDiamond(ctx, screen.x, screen.y, 30 * s, 15.5 * s);
  ctx.fillStyle = "#5aa868";
  ctx.fill();

  // Footpath across the lawn.
  ctx.strokeStyle = "rgba(249, 233, 197, 0.7)";
  ctx.lineWidth = Math.max(1, 1.6 * s);
  ctx.beginPath();
  ctx.moveTo(screen.x - 15 * s, screen.y - 7.5 * s);
  ctx.lineTo(screen.x + 15 * s, screen.y + 7.5 * s);
  ctx.stroke();

  // Trees from the in-repo Kenney sprites when loaded; simple canopies otherwise.
  const tall = getTilesetTile("treeTall");
  const short = getTilesetTile("treeShort");
  const spots = [
    { x: -14, y: 1, big: true },
    { x: 4, y: -9, big: lotHash(point, 21) > 0.5 },
    { x: 13, y: 0, big: false },
    { x: -2, y: 8, big: lotHash(point, 22) > 0.4 },
  ];
  spots.forEach((spot) => {
    const image = spot.big ? tall : short;
    const x = screen.x + spot.x * s;
    const y = screen.y + spot.y * s;
    if (image) {
      const w = image.width * 0.95 * s;
      const h = image.height * 0.95 * s;
      ctx.drawImage(image, x - w / 2, y - h + 2 * s, w, h);
      return;
    }
    ctx.fillStyle = "#376f44";
    ctx.beginPath();
    ctx.arc(x, y - 5 * s, (spot.big ? 6 : 4.5) * s, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawUtility(ctx: CanvasRenderingContext2D, screen: ScreenPoint, viewport: Viewport): void {
  drawExtrudedDiamond(
    ctx,
    screen.x,
    screen.y + 3 * viewport.scale,
    15 * viewport.scale,
    9 * viewport.scale,
    14 * viewport.scale,
    "#ffe0a8",
    "#a97f38",
    "#d3a24e",
  );

  ctx.strokeStyle = "rgba(150, 226, 255, 0.56)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(screen.x + 16 * viewport.scale, screen.y - 18 * viewport.scale);
  ctx.lineTo(screen.x + 16 * viewport.scale, screen.y + 2 * viewport.scale);
  ctx.lineTo(screen.x + 22 * viewport.scale, screen.y + 6 * viewport.scale);
  ctx.stroke();
}

function drawTransitStop(
  ctx: CanvasRenderingContext2D,
  screen: ScreenPoint,
  viewport: Viewport,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const pulse = reducedMotion ? 0 : (Math.sin(timeMs * 0.0022) + 1) * 0.5;
  const haloRadius = (18 + pulse * 5) * viewport.scale;
  ctx.strokeStyle = "rgba(136, 242, 255, 0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y - 2 * viewport.scale, haloRadius, 0, Math.PI * 2);
  ctx.stroke();

  drawExtrudedDiamond(
    ctx,
    screen.x,
    screen.y + 4 * viewport.scale,
    12 * viewport.scale,
    7 * viewport.scale,
    10 * viewport.scale,
    "#9af1ff",
    "#2d7c91",
    "#5fc7e0",
  );

  ctx.fillStyle = "#f1fbff";
  ctx.fillRect(screen.x - 2 * viewport.scale, screen.y - 17 * viewport.scale, 4 * viewport.scale, 14 * viewport.scale);
  ctx.fillStyle = "#173949";
  ctx.fillRect(screen.x - 10 * viewport.scale, screen.y - 20 * viewport.scale, 20 * viewport.scale, 5 * viewport.scale);
}

function drawTransitRoutes(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: Viewport,
  reducedMotion: boolean,
  timeMs: number,
): void {
  const stops: GridPoint[] = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const tile = getTile(state, x, y);
      if (tile.structure === "transit") {
        stops.push({ x, y });
      }
    }
  }

  if (stops.length < 2) {
    return;
  }

  const ordered = [...stops].sort((a, b) => a.x + a.y - (b.x + b.y));
  ctx.save();
  ctx.strokeStyle = "rgba(136, 242, 255, 0.42)";
  ctx.lineWidth = Math.max(1.2, viewport.scale * 2.2);
  ctx.setLineDash([10 * viewport.scale, 6 * viewport.scale]);
  ctx.lineDashOffset = reducedMotion ? 0 : -timeMs * 0.01;

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = tileToScreen(ordered[index], viewport);
    const end = tileToScreen(ordered[index + 1], viewport);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y - 8 * viewport.scale);
    ctx.lineTo(end.x, end.y - 8 * viewport.scale);
    ctx.stroke();
  }

  ctx.restore();
}

function drawStructures(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  point: GridPoint,
  screen: ScreenPoint,
  viewport: Viewport,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const tile = getTile(state, point.x, point.y);

  if (tile.structure === "park") {
    drawPark(ctx, point, screen, viewport);
    return;
  }

  if (tile.structure === "utility") {
    drawUtility(ctx, screen, viewport);
    return;
  }

  if (tile.structure === "transit") {
    drawTransitStop(ctx, screen, viewport, timeMs, reducedMotion);
    return;
  }

  if (tile.zone === "residential") {
    drawResidential(ctx, tile, point, screen, viewport);
  } else if (tile.zone === "commercial") {
    drawCommercial(ctx, tile, point, screen, viewport);
  } else if (tile.zone === "industrial") {
    drawIndustrial(ctx, tile, point, screen, viewport, timeMs, reducedMotion);
  }
}

function drawCars(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: Viewport,
): void {
  state.cars.forEach((car) => {
    const current = car.path[car.segmentIndex];
    const next = car.path[car.segmentIndex + 1];
    if (!current || !next) {
      return;
    }

    const start = tileToScreen(current, viewport);
    const end = tileToScreen(next, viewport);
    const x = start.x + (end.x - start.x) * car.progress;
    const y = start.y + (end.y - start.y) * car.progress - 2 * viewport.scale;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const offsetX = (-dy / length) * 4.5 * viewport.scale;
    const offsetY = (dx / length) * 1.6 * viewport.scale;

    ctx.save();
    ctx.translate(x + offsetX, y + offsetY);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = car.color;
    ctx.fillRect(-5 * viewport.scale, -2 * viewport.scale, 10 * viewport.scale, 4 * viewport.scale);
    ctx.fillStyle = "rgba(255, 248, 228, 0.74)";
    ctx.fillRect(3 * viewport.scale, -1 * viewport.scale, 2 * viewport.scale, 2 * viewport.scale);
    ctx.restore();
  });
}

function drawHover(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  point: GridPoint | null,
  tool: ToolId,
  viewport: Viewport,
): void {
  if (!point) {
    return;
  }

  const screen = tileToScreen(point, viewport);
  const preview = evaluatePlacement(state, point.x, point.y, tool);
  const halfWidth = (TILE_WIDTH / 2) * viewport.scale;
  const halfHeight = (TILE_HEIGHT / 2) * viewport.scale;
  drawDiamond(ctx, screen.x, screen.y, halfWidth, halfHeight);
  ctx.fillStyle = preview.allowed ? "rgba(143, 224, 191, 0.16)" : "rgba(255, 141, 138, 0.18)";
  ctx.fill();
  ctx.strokeStyle = preview.allowed ? "rgba(143, 224, 255, 0.7)" : "rgba(255, 141, 138, 0.78)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function renderDistrict(
  canvas: HTMLCanvasElement,
  state: GameState,
  options: RenderOptions,
): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  // Begins loading the isometric tile art on first render; later frames pick it up.
  loadTileset();

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 1000;
  const height = canvas.clientHeight || 700;
  const targetWidth = Math.floor(width * dpr);
  const targetHeight = Math.floor(height * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, options.timeMs, options.reducedMotion);
  drawIncidentAtmosphere(context, width, height, state, options.timeMs, options.reducedMotion);

  const viewport = getViewport(state, width, height);
  const tiles = getSortedTiles(state);

  drawBoardShadow(context, state, viewport);

  tiles.forEach((point) => {
    const screen = tileToScreen(point, viewport);
    drawTerrain(context, state, point, screen, viewport, options.timeMs, options.reducedMotion);
  });

  tiles.forEach((point) => {
    const screen = tileToScreen(point, viewport);
    drawRoad(context, state, point, screen, viewport);
    drawZoneLot(context, state, point, screen, viewport);
  });

  drawTransitRoutes(context, state, viewport, options.reducedMotion, options.timeMs);

  tiles.forEach((point) => {
    const screen = tileToScreen(point, viewport);
    drawStructures(context, state, point, screen, viewport, options.timeMs, options.reducedMotion);
  });

  drawCars(context, state, viewport);
  drawHover(context, state, options.hoveredTile, options.selectedTool, viewport);

  context.fillStyle = "rgba(238, 245, 250, 0.84)";
  context.font = '600 13px "Manrope", sans-serif';
  context.fillText(getScenario(state.scenarioId).name, 24, height - 26);
}

export function pickTileFromCanvas(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  state: GameState,
): GridPoint | null {
  const rect = canvas.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const viewport = getViewport(state, rect.width, rect.height);

  // Inverse of tileToScreen. Tile centres sit on whole grid numbers, so the nearest tile is found by
  // rounding. (Flooring here offset every hit area by half a tile: the top half of each diamond
  // missed or picked a neighbour.)
  const gridX = Math.round(
    (localY - viewport.originY) / (TILE_HEIGHT * viewport.scale) +
      (localX - viewport.originX) / (TILE_WIDTH * viewport.scale),
  );
  const gridY = Math.round(
    (localY - viewport.originY) / (TILE_HEIGHT * viewport.scale) -
      (localX - viewport.originX) / (TILE_WIDTH * viewport.scale),
  );

  if (gridX < 0 || gridY < 0 || gridX >= state.width || gridY >= state.height) {
    return null;
  }

  const screen = tileToScreen({ x: gridX, y: gridY }, viewport);
  const halfWidth = (TILE_WIDTH / 2) * viewport.scale;
  const halfHeight = (TILE_HEIGHT / 2) * viewport.scale;
  const dx = Math.abs(localX - screen.x);
  const dy = Math.abs(localY - screen.y);
  const withinDiamond = dx / halfWidth + dy / halfHeight <= 1.05;

  if (!withinDiamond) {
    return null;
  }

  return { x: gridX, y: gridY };
}
