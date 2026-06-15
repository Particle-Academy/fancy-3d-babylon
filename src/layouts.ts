/**
 * Layout helpers — map 2D scene-node positions onto 3D arrangements.
 *
 * All layout functions take the same shape: a SceneNode, the Mesh that was
 * built for it, the scene's bounds, and layout-specific options. They mutate
 * `mesh.position` (and sometimes `mesh.rotation`) in place.
 *
 * Pair with `sceneBounds(scene)` from `./babylon` to compute the bounds.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { SceneNode } from "@particle-academy/fancy-3d";

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function sizeOf(node: SceneNode): { w: number; h: number } {
  return { w: node.size?.w ?? 200, h: node.size?.h ?? 120 };
}

function normalizedCenter(node: SceneNode, bounds: Bounds) {
  const { w, h } = sizeOf(node);
  const cx = (node.position.x + w / 2 - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX);
  const cy = (node.position.y + h / 2 - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY);
  return { cx, cy };
}

/* ------------------------------------------------------------------ */
/* Grid — flat XY grid in front of the camera                          */
/* ------------------------------------------------------------------ */

export interface GridLayoutOpts {
  /** Pixel-to-world unit ratio. Defaults to 1/120. */
  scale?: number;
  /** World-space center of the grid. Defaults to (0, 0, 0). */
  origin?: Vector3;
}

/**
 * Direct 2D-to-3D mapping. DOM (x, y) becomes world (x, -y, 0) — the most
 * literal layout. Useful when you want the scene to look identical to its
 * DOM rendering, just rendered as floating panels.
 */
export function placeOnGrid(node: SceneNode, mesh: Mesh, bounds: Bounds, opts: GridLayoutOpts = {}) {
  const scale = opts.scale ?? 1 / 120;
  const origin = opts.origin ?? new Vector3(0, 0, 0);
  const { w, h } = sizeOf(node);
  const cx = node.position.x + w / 2 - (bounds.minX + bounds.maxX) / 2;
  const cy = node.position.y + h / 2 - (bounds.minY + bounds.maxY) / 2;
  mesh.position = new Vector3(origin.x + cx * scale, origin.y - cy * scale, origin.z);
}

/* ------------------------------------------------------------------ */
/* Wall — gallery layout against a vertical plane                      */
/* ------------------------------------------------------------------ */

export interface WallLayoutOpts {
  /** Distance from origin along the wall's normal. Defaults to 0. */
  z?: number;
  /** Spread along world X. Defaults to 10 world units. */
  spreadX?: number;
  /** Spread along world Y. Defaults to 4 world units. */
  spreadY?: number;
  /** Wall vertical center. Defaults to 1.5 world units. */
  centerY?: number;
}

/**
 * Hangs panels on a flat virtual wall, centered on the world origin and
 * facing +Z.
 */
export function placeOnWall(node: SceneNode, mesh: Mesh, bounds: Bounds, opts: WallLayoutOpts = {}) {
  const spreadX = opts.spreadX ?? 10;
  const spreadY = opts.spreadY ?? 4;
  const centerY = opts.centerY ?? 1.5;
  const z = opts.z ?? 0;
  const { cx, cy } = normalizedCenter(node, bounds);
  mesh.position = new Vector3((cx - 0.5) * spreadX, centerY + (0.5 - cy) * spreadY, z);
  mesh.rotation.y = 0;
}

/* ------------------------------------------------------------------ */
/* Arc — partial cylinder (alias of placeOnCylinder with friendlier name) */
/* ------------------------------------------------------------------ */

export interface ArcLayoutOpts {
  /** Cylinder radius. Defaults to 6. */
  radius?: number;
  /** Total arc spanned in radians. Defaults to π * 0.9 (~160°). */
  arc?: number;
  /** Vertical extent. Defaults to 6. */
  height?: number;
  /** Base Y of the arc. Defaults to 0. */
  baseY?: number;
}

/**
 * Wraps DOM x onto an angle around a vertical axis; DOM y becomes height.
 * Same math as `placeOnCylinder` from `./babylon`, exposed here with a
 * clearer name and consistent options shape.
 */
export function placeOnArc(node: SceneNode, mesh: Mesh, bounds: Bounds, opts: ArcLayoutOpts = {}) {
  const radius = opts.radius ?? 6;
  const arc = opts.arc ?? Math.PI * 0.9;
  const height = opts.height ?? 6;
  const baseY = opts.baseY ?? 0;
  const { cx, cy } = normalizedCenter(node, bounds);
  const angle = (cx - 0.5) * arc;
  mesh.position = new Vector3(Math.sin(angle) * radius, baseY + (0.5 - cy) * height, Math.cos(angle) * radius);
  mesh.rotation.y = angle;
}

/* ------------------------------------------------------------------ */
/* Path — distribute along a sequence of waypoints                     */
/* ------------------------------------------------------------------ */

export interface PathLayoutOpts {
  /** Waypoints along the path. */
  waypoints: Vector3[];
  /** Should each mesh face the next waypoint? Defaults to true. */
  faceForward?: boolean;
  /** Distribute by node index (0..n-1) instead of normalized x. Defaults to false. */
  byIndex?: boolean;
  /** Total node count when using `byIndex`. Defaults to inferred from bounds. */
  nodeCount?: number;
}

function lerpPath(waypoints: Vector3[], t: number): { pos: Vector3; tangent: Vector3 } {
  if (waypoints.length === 0) return { pos: new Vector3(0, 0, 0), tangent: new Vector3(0, 0, 1) };
  if (waypoints.length === 1) return { pos: waypoints[0].clone(), tangent: new Vector3(0, 0, 1) };
  const segments = waypoints.length - 1;
  const scaled = Math.max(0, Math.min(1, t)) * segments;
  const i = Math.min(segments - 1, Math.floor(scaled));
  const local = scaled - i;
  const a = waypoints[i];
  const b = waypoints[i + 1];
  const pos = Vector3.Lerp(a, b, local);
  const tangent = b.subtract(a).normalize();
  return { pos, tangent };
}

/**
 * Distributes nodes along a polyline. Each mesh sits on the path; if
 * `faceForward` is true, each mesh's +Y rotation aligns with the path
 * tangent.
 */
export function placeOnPath(node: SceneNode, mesh: Mesh, bounds: Bounds, opts: PathLayoutOpts) {
  const faceForward = opts.faceForward ?? true;
  let t: number;
  if (opts.byIndex) {
    const total = opts.nodeCount ?? Math.max(1, bounds.maxX - bounds.minX);
    const idx = node.position.x;
    t = total > 1 ? idx / (total - 1) : 0.5;
  } else {
    const { cx } = normalizedCenter(node, bounds);
    t = cx;
  }
  const { pos, tangent } = lerpPath(opts.waypoints, t);
  mesh.position = pos;
  if (faceForward) {
    mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
  }
}

/* ------------------------------------------------------------------ */
/* Sphere — wrap nodes onto a sphere surface                            */
/* ------------------------------------------------------------------ */

export interface SphereLayoutOpts {
  /** Sphere radius. Defaults to 5. */
  radius?: number;
  /** World-space center. Defaults to (0, 0, 0). */
  center?: Vector3;
  /** Latitude span in radians (0..π). Defaults to π * 0.7 (avoids poles). */
  latSpan?: number;
  /** Longitude span in radians (0..2π). Defaults to 2π. */
  lonSpan?: number;
}

/**
 * DOM x → longitude, DOM y → latitude. Useful for "globe of widgets" or
 * any kind of spherical immersive layout.
 */
export function placeOnSphere(node: SceneNode, mesh: Mesh, bounds: Bounds, opts: SphereLayoutOpts = {}) {
  const radius = opts.radius ?? 5;
  const center = opts.center ?? new Vector3(0, 0, 0);
  const latSpan = opts.latSpan ?? Math.PI * 0.7;
  const lonSpan = opts.lonSpan ?? Math.PI * 2;
  const { cx, cy } = normalizedCenter(node, bounds);
  const lon = (cx - 0.5) * lonSpan;
  const lat = (0.5 - cy) * latSpan;
  const r = radius;
  const x = r * Math.cos(lat) * Math.sin(lon);
  const y = r * Math.sin(lat);
  const z = r * Math.cos(lat) * Math.cos(lon);
  mesh.position = new Vector3(center.x + x, center.y + y, center.z + z);
  mesh.rotation.y = lon;
}
