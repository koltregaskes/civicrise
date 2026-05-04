import { getScenario } from "./scenario";
import { evaluatePlacement, getTile } from "./simulation";
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

function getViewport(state: GameState, width: number, height: number): Viewport {
  const worldWidth = (state.width + state.height) * (TILE_WIDTH / 2);
  const worldHeight = (state.width + state.height) * (TILE_HEIGHT / 2);
  const scale = Math.min(width / (worldWidth * 1.08), height / (worldHeight * 1.1), 1.28);

  return {
    scale,
    originX: width * 0.52,
    originY: Math.max(84, height * 0.16),
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

function drawResidential(
  ctx: CanvasRenderingContext2D,
  tile: ReturnType<typeof getTile>,
  screen: ScreenPoint,
  viewport: Viewport,
): void {
  const tier = tile.development < 18 ? 0 : tile.development < 44 ? 1 : tile.development < 74 ? 2 : 3;
  if (tier === 0) {
    return;
  }

  const width = 12 * viewport.scale;
  const depth = 7 * viewport.scale;
  const firstHeight = (16 + tier * 8) * viewport.scale;
  const secondHeight = tier >= 2 ? (10 + tier * 6) * viewport.scale : 0;

  drawExtrudedDiamond(
    ctx,
    screen.x - 10 * viewport.scale,
    screen.y + 1 * viewport.scale,
    width,
    depth,
    firstHeight,
    "#f0f4ee",
    "#bcc8bc",
    "#dbe7db",
  );

  if (secondHeight > 0) {
    drawExtrudedDiamond(
      ctx,
      screen.x + 10 * viewport.scale,
      screen.y + 2 * viewport.scale,
      width * 0.78,
      depth * 0.76,
      secondHeight,
      "#d8f1e4",
      "#9fc5b4",
      "#b7dcc9",
    );
  }

  ctx.fillStyle = "rgba(122, 169, 145, 0.42)";
  ctx.fillRect(screen.x - 14 * viewport.scale, screen.y - firstHeight + 6 * viewport.scale, 4 * viewport.scale, 10 * viewport.scale);
}

function drawCommercial(
  ctx: CanvasRenderingContext2D,
  tile: ReturnType<typeof getTile>,
  screen: ScreenPoint,
  viewport: Viewport,
): void {
  const tier = tile.development < 18 ? 0 : tile.development < 44 ? 1 : tile.development < 74 ? 2 : 3;
  if (tier === 0) {
    return;
  }

  const width = 16 * viewport.scale;
  const depth = 9 * viewport.scale;
  const height = (18 + tier * 12) * viewport.scale;

  drawExtrudedDiamond(
    ctx,
    screen.x,
    screen.y + 1 * viewport.scale,
    width,
    depth,
    height,
    "#c5efff",
    "#6ea5bf",
    "#8bc6e3",
  );

  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  for (let i = 0; i < tier + 1; i += 1) {
    const y = screen.y - height + 7 * viewport.scale + i * 7 * viewport.scale;
    ctx.beginPath();
    ctx.moveTo(screen.x - 11 * viewport.scale, y);
    ctx.lineTo(screen.x + 11 * viewport.scale, y);
    ctx.stroke();
  }
}

function drawIndustrial(
  ctx: CanvasRenderingContext2D,
  tile: ReturnType<typeof getTile>,
  screen: ScreenPoint,
  viewport: Viewport,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const tier = tile.development < 18 ? 0 : tile.development < 44 ? 1 : tile.development < 74 ? 2 : 3;
  if (tier === 0) {
    return;
  }

  drawExtrudedDiamond(
    ctx,
    screen.x - 6 * viewport.scale,
    screen.y + 3 * viewport.scale,
    16 * viewport.scale,
    10 * viewport.scale,
    (12 + tier * 5) * viewport.scale,
    "#d4b38d",
    "#8d6b48",
    "#b0885d",
  );
  drawExtrudedDiamond(
    ctx,
    screen.x + 11 * viewport.scale,
    screen.y + 3 * viewport.scale,
    8 * viewport.scale,
    5 * viewport.scale,
    (18 + tier * 6) * viewport.scale,
    "#ffb17f",
    "#c16d47",
    "#da7f57",
  );

  const smokeOffset = reducedMotion ? 0 : Math.sin(timeMs * 0.002 + tile.variant) * 3;
  ctx.fillStyle = "rgba(217, 227, 233, 0.18)";
  ctx.beginPath();
  ctx.arc(
    screen.x + 11 * viewport.scale,
    screen.y - (22 + tier * 6) * viewport.scale + smokeOffset,
    8 * viewport.scale,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

function drawPark(ctx: CanvasRenderingContext2D, screen: ScreenPoint, viewport: Viewport): void {
  drawDiamond(ctx, screen.x, screen.y, 18 * viewport.scale, 9 * viewport.scale);
  ctx.fillStyle = "#5aa868";
  ctx.fill();

  ctx.fillStyle = "#376f44";
  ctx.beginPath();
  ctx.arc(screen.x - 10 * viewport.scale, screen.y - 6 * viewport.scale, 6 * viewport.scale, 0, Math.PI * 2);
  ctx.arc(screen.x + 10 * viewport.scale, screen.y - 2 * viewport.scale, 5.5 * viewport.scale, 0, Math.PI * 2);
  ctx.arc(screen.x, screen.y + 3 * viewport.scale, 5 * viewport.scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(249, 233, 197, 0.58)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(screen.x - 10 * viewport.scale, screen.y);
  ctx.lineTo(screen.x + 10 * viewport.scale, screen.y);
  ctx.stroke();
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
    drawPark(ctx, screen, viewport);
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
    drawResidential(ctx, tile, screen, viewport);
  } else if (tile.zone === "commercial") {
    drawCommercial(ctx, tile, screen, viewport);
  } else if (tile.zone === "industrial") {
    drawIndustrial(ctx, tile, screen, viewport, timeMs, reducedMotion);
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

  context.fillStyle = "rgba(0, 0, 0, 0.16)";
  context.beginPath();
  context.ellipse(width * 0.52, height * 0.67, width * 0.28, height * 0.11, 0, 0, Math.PI * 2);
  context.fill();

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

  const gridX = Math.floor(
    (localY - viewport.originY) / (TILE_HEIGHT * viewport.scale) +
      (localX - viewport.originX) / (TILE_WIDTH * viewport.scale),
  );
  const gridY = Math.floor(
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
