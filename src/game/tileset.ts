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
 * Chooses the road piece that matches which neighbours are also roads.
 * Directions are the board's four grid neighbours, which project to the
 * diamond's up / right / down / left corners on screen.
 */
export function pickRoadTile(north: boolean, east: boolean, south: boolean, west: boolean): TileName {
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
 * Draws an isometric tile so its diamond top face is centred on (screenX, screenY),
 * matching where the vector renderer places its diamonds.
 */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  screenX: number,
  screenY: number,
  tileWidth: number,
): void {
  const scale = tileWidth / TILE_SOURCE_WIDTH;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const originX = screenX - drawWidth / 2;
  const originY = screenY - (TILE_SOURCE_DIAMOND_HEIGHT / 2) * scale;
  ctx.drawImage(image, originX, originY, drawWidth, drawHeight);
}
