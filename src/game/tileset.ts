/**
 * Kenney "Isometric Roads" tileset (CC0) used for the ground plane.
 *
 * Source tiles are 100x65 with a 100x50 diamond top face, which matches the
 * board's 2:1 diamond (TILE_WIDTH 78 / TILE_HEIGHT 40) once scaled. Images load
 * asynchronously; every lookup returns null until they are ready so the renderer
 * can fall back to the original vector drawing without flickering.
 */

const TILE_NAMES = [
  "grass",
  "water",
  "dirt",
  "road",
  "roadEW",
  "roadNS",
  "roadNE",
  "roadNW",
  "roadSW",
  "roadES",
  "crossroad",
  "crossroadNES",
  "crossroadNEW",
  "crossroadESW",
  "crossroadNSW",
  "endN",
  "endE",
  "endS",
  "endW",
  "treeTall",
  "treeShort",
] as const;

export type TileName = (typeof TILE_NAMES)[number];

/** Native size of a Kenney tile and the height of its diamond top face. */
export const TILE_SOURCE_WIDTH = 100;
export const TILE_SOURCE_DIAMOND_HEIGHT = 50;

const images = new Map<TileName, HTMLImageElement>();
let ready = false;
let started = false;

export function isTilesetReady(): boolean {
  return ready;
}

export function getTile(name: TileName): HTMLImageElement | null {
  if (!ready) return null;
  return images.get(name) ?? null;
}

/** Kicks off loading once; safe to call from render. */
export function loadTileset(): void {
  if (started || typeof Image === "undefined") return;
  started = true;

  let remaining = TILE_NAMES.length;
  TILE_NAMES.forEach((name) => {
    const image = new Image();
    image.onload = () => {
      images.set(name, image);
      remaining -= 1;
      if (remaining === 0) ready = true;
    };
    image.onerror = () => {
      remaining -= 1;
      if (remaining === 0) ready = images.size > 0;
    };
    image.src = new URL(`assets/tiles/${name}.png`, document.baseURI).href;
  });
}

/**
 * Chooses the road piece that matches which grid neighbours are also roads.
 *
 * Kenney names its pieces by screen edge, with north as the up-left edge of the diamond:
 * N = up-left, E = up-right, S = down-right, W = down-left (checked against the pixels of
 * every piece). The board's grid is turned a quarter from that: grid north (y - 1) sits up-right
 * on screen, grid east (x + 1) down-right, grid south (y + 1) down-left and grid west (x - 1)
 * up-left. Feeding grid directions straight in drew every road across its own line, which is
 * what made straight roads read as rows of separate slats.
 */
export function pickRoadTile(north: boolean, east: boolean, south: boolean, west: boolean): TileName {
  return pickKenneyRoad(west, north, east, south);
}

/** Picks a piece from Kenney screen edges (N up-left, E up-right, S down-right, W down-left). */
function pickKenneyRoad(north: boolean, east: boolean, south: boolean, west: boolean): TileName {
  const count = Number(north) + Number(east) + Number(south) + Number(west);

  if (count === 4) return "crossroad";

  if (count === 3) {
    if (!west) return "crossroadNES";
    if (!south) return "crossroadNEW";
    if (!north) return "crossroadESW";
    return "crossroadNSW";
  }

  if (count === 2) {
    if (north && south) return "roadNS";
    if (east && west) return "roadEW";
    if (north && east) return "roadNE";
    if (north && west) return "roadNW";
    if (south && west) return "roadSW";
    return "roadES";
  }

  if (count === 1) {
    if (north) return "endN";
    if (east) return "endE";
    if (south) return "endS";
    return "endW";
  }

  return "road";
}

/**
 * Overlap, in screen pixels, added round each tile so smoothed edges of neighbouring tiles cover
 * each other instead of letting the dark backdrop show through as hairline seams.
 */
const TILE_BLEED = 0.75;

/**
 * Draws an isometric tile so its diamond top face exactly covers the board diamond centred on
 * (screenX, screenY) that is diamondWidth wide and diamondHeight tall. Width and height are
 * scaled separately: the board diamond is 78 x 40, which is not quite the 2:1 of the art
 * (100 x 50), so a single scale left a 1 px step on every row.
 */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  screenX: number,
  screenY: number,
  diamondWidth: number,
  diamondHeight: number,
): void {
  const scaleX = (diamondWidth + TILE_BLEED * 2) / TILE_SOURCE_WIDTH;
  const scaleY = (diamondHeight + TILE_BLEED) / TILE_SOURCE_DIAMOND_HEIGHT;
  const drawWidth = image.width * scaleX;
  const drawHeight = image.height * scaleY;
  const originX = screenX - drawWidth / 2;
  const originY = screenY - (TILE_SOURCE_DIAMOND_HEIGHT / 2) * scaleY;
  ctx.drawImage(image, originX, originY, drawWidth, drawHeight);
}
