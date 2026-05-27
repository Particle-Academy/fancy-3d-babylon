/**
 * 3D shape primitives for `@particle-academy/fancy-3d`.
 *
 * A primitive is a Babylon mesh that can host UI content on its surface —
 * either a flat color, a freeform 2D paint callback, or a `WidgetSpec`
 * rendered through the same painters as the Babylon adapter.
 *
 * Every primitive returns a `Mesh`, ready to position in your scene.
 */
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  Vector4,
  type Scene,
} from "@babylonjs/core";
import type { WidgetSpec } from "@particle-academy/fancy-3d";
import { TEX_SCALE, paintWidget } from "./painters";

export type PaintFn = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

export type SurfaceContent =
  | { type: "color"; color: string }
  | { type: "paint"; paint: PaintFn; pixelWidth?: number; pixelHeight?: number; transparent?: boolean }
  | { type: "widget"; widget: WidgetSpec; pixelWidth?: number; pixelHeight?: number; selected?: boolean };

/** Default pixel density when a primitive auto-sizes a widget surface from
 *  world-space dimensions (1 world unit ≈ 1 meter). Higher values produce
 *  sharper textures at the cost of GPU memory. */
const DEFAULT_DENSITY = 120;
const MAX_TEXTURE_AXIS = 1024;

function autoPixelSize(worldWidth: number, worldHeight: number, density = DEFAULT_DENSITY) {
  let w = Math.max(96, Math.round(worldWidth * density));
  let h = Math.max(96, Math.round(worldHeight * density));
  const scale = Math.min(1, MAX_TEXTURE_AXIS / Math.max(w, h));
  if (scale < 1) {
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  return { w, h };
}

interface SurfaceTexture {
  material: StandardMaterial;
  texture: DynamicTexture | null;
}

function buildSurface(
  scene: Scene,
  name: string,
  surface: SurfaceContent,
  autoSize?: { worldWidth: number; worldHeight: number }
): SurfaceTexture {
  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);

  if (surface.type === "color") {
    mat.diffuseColor = Color3.FromHexString(surface.color);
    mat.emissiveColor = Color3.FromHexString(surface.color).scale(0.15);
    return { material: mat, texture: null };
  }

  let w = surface.pixelWidth;
  let h = surface.pixelHeight;
  if ((w == null || h == null) && autoSize) {
    const auto = autoPixelSize(autoSize.worldWidth, autoSize.worldHeight);
    w = w ?? auto.w;
    h = h ?? auto.h;
  }
  w = w ?? 512;
  h = h ?? 512;
  const tex = new DynamicTexture(`${name}-tex`, { width: w * TEX_SCALE, height: h * TEX_SCALE }, scene, true);
  // Babylon plane UVs run V=0 at the bottom; canvas Y runs top-to-bottom.
  tex.vScale = -1;
  tex.vOffset = 1;
  if (surface.type === "paint" && surface.transparent) {
    tex.hasAlpha = true;
  }
  if (surface.type === "widget") {
    tex.hasAlpha = true;
  }
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.scale(TEX_SCALE, TEX_SCALE);
  if (surface.type === "paint") {
    surface.paint(ctx, w, h);
  } else {
    paintWidget(ctx, surface.widget, w, h, surface.selected ?? false);
  }
  tex.update(false);

  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.6, 0.6, 0.6);
  if (tex.hasAlpha) mat.useAlphaFromDiffuseTexture = true;

  return { material: mat, texture: tex };
}

/* ------------------------------------------------------------------ */
/* Panel — flat 2D plane with one surface                              */
/* ------------------------------------------------------------------ */

export interface PanelOpts {
  scene: Scene;
  name?: string;
  width: number;
  height: number;
  surface: SurfaceContent;
  /** Babylon sideOrientation. Use `Mesh.DOUBLESIDE` for panels you want visible
   *  from both directions (e.g. self-luminous screens). Default is FRONTSIDE. */
  sideOrientation?: number;
}

export function createPanel(opts: PanelOpts): Mesh {
  const name = opts.name ?? "panel";
  const m = MeshBuilder.CreatePlane(name, { width: opts.width, height: opts.height, sideOrientation: opts.sideOrientation }, opts.scene);
  const { material } = buildSurface(opts.scene, name, opts.surface, {
    worldWidth: opts.width,
    worldHeight: opts.height,
  });
  m.material = material;
  return m;
}

/* ------------------------------------------------------------------ */
/* Billboard — panel that can be set to always face the camera         */
/* ------------------------------------------------------------------ */

export interface BillboardOpts extends PanelOpts {
  /** When true, mesh.billboardMode = ALL — always faces the camera. */
  faceCamera?: boolean;
}

export function createBillboard(opts: BillboardOpts): Mesh {
  const m = createPanel({ ...opts, name: opts.name ?? "billboard" });
  if (opts.faceCamera) {
    m.billboardMode = Mesh.BILLBOARDMODE_ALL;
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Building — rectangular box with optional facade texture             */
/* ------------------------------------------------------------------ */

export interface BuildingOpts {
  scene: Scene;
  name?: string;
  width: number;
  height: number;
  depth: number;
  /** Surface applied to all 6 faces (cheap path). */
  surface?: SurfaceContent;
  /** Per-face surfaces; missing faces use `surface` or a default grey. */
  faces?: Partial<Record<BoxFace, SurfaceContent>>;
}

/** Babylon box face indices (CreateBox): 0=front (-Z), 1=back (+Z), 2=right (+X), 3=left (-X), 4=top (+Y), 5=bottom (-Y). */
export type BoxFace = "front" | "back" | "right" | "left" | "top" | "bottom";

const BOX_FACE_ORDER: BoxFace[] = ["front", "back", "right", "left", "top", "bottom"];

export function createBuilding(opts: BuildingOpts): Mesh {
  const name = opts.name ?? "building";
  // If only a single uniform surface is given, take the cheap path.
  if (opts.surface && !opts.faces) {
    const box = MeshBuilder.CreateBox(name, { width: opts.width, height: opts.height, depth: opts.depth }, opts.scene);
    const { material } = buildSurface(opts.scene, name, opts.surface, {
      worldWidth: opts.width,
      worldHeight: opts.height,
    });
    box.material = material;
    return box;
  }

  // Per-face surfaces — Babylon's CreateBox supports `faceUV` to map sub-rects
  // of a single texture onto each face. We composite 6 sub-textures into one.
  const faceW = 256;
  const faceH = 256;
  const atlasW = faceW * 3;
  const atlasH = faceH * 2;
  const tex = new DynamicTexture(`${name}-atlas`, { width: atlasW * TEX_SCALE, height: atlasH * TEX_SCALE }, opts.scene, true);
  tex.vScale = -1;
  tex.vOffset = 1;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.scale(TEX_SCALE, TEX_SCALE);

  const faceUV: Vector4[] = [];
  BOX_FACE_ORDER.forEach((face, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const fx = col * faceW;
    const fy = row * faceH;
    const surface = opts.faces?.[face] ?? opts.surface ?? { type: "color", color: "#475569" };
    ctx.save();
    ctx.translate(fx, fy);
    if (surface.type === "color") {
      ctx.fillStyle = surface.color;
      ctx.fillRect(0, 0, faceW, faceH);
    } else if (surface.type === "paint") {
      surface.paint(ctx, faceW, faceH);
    } else {
      paintWidget(ctx, surface.widget, faceW, faceH, surface.selected ?? false);
    }
    ctx.restore();

    // UV rect for this face within the atlas.
    faceUV.push(new Vector4(fx / atlasW, 1 - (fy + faceH) / atlasH, (fx + faceW) / atlasW, 1 - fy / atlasH));
  });
  tex.update(false);

  const mat = new StandardMaterial(`${name}-mat`, opts.scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.4, 0.4, 0.4);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);

  const box = MeshBuilder.CreateBox(name, {
    width: opts.width,
    height: opts.height,
    depth: opts.depth,
    faceUV,
    wrap: true,
  }, opts.scene);
  box.material = mat;
  return box;
}

/* ------------------------------------------------------------------ */
/* Pillar — alias for a tall narrow building                           */
/* ------------------------------------------------------------------ */

export interface PillarOpts {
  scene: Scene;
  name?: string;
  thickness: number;
  height: number;
  surface?: SurfaceContent;
}

export function createPillar(opts: PillarOpts): Mesh {
  return createBuilding({
    scene: opts.scene,
    name: opts.name ?? "pillar",
    width: opts.thickness,
    depth: opts.thickness,
    height: opts.height,
    surface: opts.surface,
  });
}

/* ------------------------------------------------------------------ */
/* Cylinder — tube with content wrapping the side                      */
/* ------------------------------------------------------------------ */

export interface CylinderOpts {
  scene: Scene;
  name?: string;
  radius: number;
  height: number;
  surface: SurfaceContent;
  tessellation?: number;
}

export function createCylinder(opts: CylinderOpts): Mesh {
  const name = opts.name ?? "cylinder";
  const m = MeshBuilder.CreateCylinder(name, {
    diameter: opts.radius * 2,
    height: opts.height,
    tessellation: opts.tessellation ?? 48,
  }, opts.scene);
  const { material } = buildSurface(opts.scene, name, opts.surface, {
    worldWidth: opts.radius * 2 * Math.PI,
    worldHeight: opts.height,
  });
  m.material = material;
  return m;
}

/* ------------------------------------------------------------------ */
/* CurvedPanel — a partial cylindrical sheet (like a wraparound ad)    */
/* ------------------------------------------------------------------ */

export interface CurvedPanelOpts {
  scene: Scene;
  name?: string;
  width: number; // arc length
  height: number;
  arc: number; // radians spanned
  surface: SurfaceContent;
  tessellation?: number;
}

export function createCurvedPanel(opts: CurvedPanelOpts): Mesh {
  const name = opts.name ?? "curved-panel";
  const radius = opts.width / opts.arc;
  // Build by creating a partial cylinder (arc fraction) with no caps.
  const tess = opts.tessellation ?? 48;
  const fullCircleSegments = Math.max(8, Math.ceil((tess * (Math.PI * 2)) / opts.arc));
  const m = MeshBuilder.CreateCylinder(name, {
    diameter: radius * 2,
    height: opts.height,
    tessellation: fullCircleSegments,
    arc: opts.arc / (Math.PI * 2),
    cap: Mesh.NO_CAP,
    sideOrientation: Mesh.DOUBLESIDE,
  }, opts.scene);
  const { material } = buildSurface(opts.scene, name, opts.surface, {
    worldWidth: opts.width,
    worldHeight: opts.height,
  });
  m.material = material;
  return m;
}

/* ------------------------------------------------------------------ */
/* Sphere — full sphere with equirectangular surface                   */
/* ------------------------------------------------------------------ */

export interface SphereOpts {
  scene: Scene;
  name?: string;
  diameter: number;
  surface: SurfaceContent;
  segments?: number;
}

export function createSphere(opts: SphereOpts): Mesh {
  const name = opts.name ?? "sphere";
  const m = MeshBuilder.CreateSphere(name, { diameter: opts.diameter, segments: opts.segments ?? 32 }, opts.scene);
  const { material } = buildSurface(opts.scene, name, opts.surface, {
    worldWidth: opts.diameter * Math.PI,
    worldHeight: opts.diameter * Math.PI / 2,
  });
  m.material = material;
  return m;
}

/* ------------------------------------------------------------------ */
/* Disc — flat disc/circle                                             */
/* ------------------------------------------------------------------ */

export interface DiscOpts {
  scene: Scene;
  name?: string;
  radius: number;
  surface: SurfaceContent;
  tessellation?: number;
}

export function createDisc(opts: DiscOpts): Mesh {
  const name = opts.name ?? "disc";
  const m = MeshBuilder.CreateDisc(name, { radius: opts.radius, tessellation: opts.tessellation ?? 64 }, opts.scene);
  const { material } = buildSurface(opts.scene, name, opts.surface, {
    worldWidth: opts.radius * 2,
    worldHeight: opts.radius * 2,
  });
  m.material = material;
  return m;
}

/* ------------------------------------------------------------------ */
/* Card3D — an extruded panel (gives panels physical depth)            */
/* ------------------------------------------------------------------ */

export interface Card3DOpts {
  scene: Scene;
  name?: string;
  width: number;
  height: number;
  /** Extrusion depth. Defaults to a thin 0.06 — like real foam-board signage. */
  depth?: number;
  /** Surface for the front face (the visible UI). */
  front: SurfaceContent;
  /** Surface for the side and back faces. Defaults to a dark color. */
  edge?: SurfaceContent;
}

export function createCard3D(opts: Card3DOpts): Mesh {
  const name = opts.name ?? "card3d";
  const depth = opts.depth ?? 0.06;
  const edge = opts.edge ?? { type: "color" as const, color: "#0b0f17" };
  return createBuilding({
    scene: opts.scene,
    name,
    width: opts.width,
    height: opts.height,
    depth,
    faces: {
      front: opts.front,
      back: edge,
      top: edge,
      bottom: edge,
      left: edge,
      right: edge,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Sign — a panel mounted on a post                                     */
/* ------------------------------------------------------------------ */

export interface SignOpts {
  scene: Scene;
  name?: string;
  /** Panel dimensions. */
  width: number;
  height: number;
  /** How tall the post is (from ground to bottom of panel). */
  postHeight?: number;
  /** Post thickness (square cross-section). */
  postThickness?: number;
  /** Panel surface (color, paint, or widget). */
  surface: SurfaceContent;
  /** Post color. */
  postColor?: string;
}

export interface SignResult {
  /** Group containing the panel + post, parented at ground level. */
  root: Mesh;
  panel: Mesh;
  post: Mesh;
}

export function createSign(opts: SignOpts): SignResult {
  const name = opts.name ?? "sign";
  const postHeight = opts.postHeight ?? 1.4;
  const postThickness = opts.postThickness ?? 0.12;
  const postColor = opts.postColor ?? "#1f2937";

  const root = new Mesh(`${name}-root`, opts.scene);

  const panel = createBillboard({
    scene: opts.scene,
    name: `${name}-panel`,
    width: opts.width,
    height: opts.height,
    surface: opts.surface,
  });
  panel.position = new Vector3(0, postHeight + opts.height / 2, 0);
  panel.parent = root;

  const post = MeshBuilder.CreateBox(`${name}-post`, {
    width: postThickness,
    height: postHeight,
    depth: postThickness,
  }, opts.scene);
  post.position = new Vector3(0, postHeight / 2, 0);
  const postMat = new StandardMaterial(`${name}-post-mat`, opts.scene);
  postMat.diffuseColor = Color3.FromHexString(postColor);
  post.material = postMat;
  post.parent = root;

  return { root, panel, post };
}

/* ------------------------------------------------------------------ */
/* Monitor — a 3D display: extruded bezel + recessed screen face       */
/* ------------------------------------------------------------------ */

export interface MonitorOpts {
  scene: Scene;
  name?: string;
  width: number;
  height: number;
  /** Front-to-back depth of the display chassis. Defaults to 0.18. */
  depth?: number;
  /** Bezel color. Defaults to near-black. */
  bezel?: string;
  /** Screen surface — color, paint, or widget. */
  screen: SurfaceContent;
  /** Optional kickstand height — when set, the monitor sits on a base. */
  standHeight?: number;
}

export interface MonitorResult {
  root: Mesh;
  body: Mesh;
  screen: Mesh;
  stand?: Mesh;
}

export function createMonitor(opts: MonitorOpts): MonitorResult {
  const name = opts.name ?? "monitor";
  const depth = opts.depth ?? 0.18;
  const bezelColor = opts.bezel ?? "#0b0f17";

  const root = new Mesh(`${name}-root`, opts.scene);

  // Body — extruded bezel
  const body = MeshBuilder.CreateBox(`${name}-body`, {
    width: opts.width,
    height: opts.height,
    depth,
  }, opts.scene);
  const bodyMat = new StandardMaterial(`${name}-body-mat`, opts.scene);
  bodyMat.diffuseColor = Color3.FromHexString(bezelColor);
  bodyMat.specularColor = new Color3(0.08, 0.08, 0.08);
  body.material = bodyMat;
  body.parent = root;

  // Screen face — sits flush at the front (+Z) face of the bezel.
  // Babylon's default plane has its visible face on -Z (per the docs:
  // "default plane faces the negative Z direction"). The default
  // ArcRotateCamera sits at +Z, so we need the screen's visible face to
  // point +Z. `BACKSIDE` orientation flips visibility from -Z to +Z without
  // rotating the plane (which would also mirror the texture). The screen
  // sits 0.001 in front of the body's +Z face so it's not occluded.
  const screenInset = 0.04;
  const screenW = opts.width - screenInset * 2;
  const screenH = opts.height - screenInset * 2;
  // Use a very thin extruded card for the screen face. This delegates to
  // createBuilding's per-face Box atlas, which handles UV orientation
  // correctly out of the box (a flat Plane's UVs render mirrored from the
  // default camera angle without orientation gymnastics).
  const screen = createCard3D({
    scene: opts.scene,
    name: `${name}-screen`,
    width: screenW,
    height: screenH,
    depth: 0.01,
    front: opts.screen,
    edge: { type: "color", color: bezelColor },
  });
  screen.position = new Vector3(0, 0, depth / 2 + 0.005);
  screen.parent = root;

  let stand: Mesh | undefined;
  if (opts.standHeight && opts.standHeight > 0) {
    stand = MeshBuilder.CreateBox(`${name}-stand`, {
      width: opts.width * 0.3,
      height: opts.standHeight,
      depth: depth * 1.5,
    }, opts.scene);
    stand.position = new Vector3(0, -opts.height / 2 - opts.standHeight / 2, 0);
    stand.material = bodyMat;
    stand.parent = root;
  }

  return { root, body, screen, stand };
}

/* ------------------------------------------------------------------ */
/* Decal — project a 2D pattern onto another mesh's surface            */
/* ------------------------------------------------------------------ */

export interface DecalOpts {
  scene: Scene;
  name?: string;
  /** The mesh to project the decal onto. */
  target: Mesh;
  /** World-space position the projector sits at. */
  position: Vector3;
  /** Direction the projector points. Defaults to -Z. */
  normal?: Vector3;
  /** Size of the decal box. */
  size: { width: number; height: number; depth?: number };
  /** Rotation around the projection axis (radians). */
  angle?: number;
  /** Surface to project. */
  surface: SurfaceContent;
}

/**
 * Projects a SurfaceContent onto `target`'s geometry. The decal conforms to
 * the underlying surface — useful for signage on curved walls, logos on
 * irregular terrain, graffiti on cylindrical surfaces, etc.
 */
export function createDecal(opts: DecalOpts): Mesh {
  const name = opts.name ?? "decal";
  const normal = opts.normal ?? new Vector3(0, 0, -1);
  const size = new Vector3(opts.size.width, opts.size.height, opts.size.depth ?? 1);

  const decal = MeshBuilder.CreateDecal(name, opts.target, {
    position: opts.position,
    normal,
    size,
    angle: opts.angle,
  });

  const { material } = buildSurface(opts.scene, name, opts.surface, {
    worldWidth: opts.size.width,
    worldHeight: opts.size.height,
  });
  // Decals need transparency to show the underlying mesh through their borders.
  if ("hasAlpha" in (material as StandardMaterial)) {
    (material as StandardMaterial).useAlphaFromDiffuseTexture = true;
  }
  decal.material = material;
  return decal;
}

/* ------------------------------------------------------------------ */
/* Helper: paint a widget onto a fresh DynamicTexture (escape hatch)   */
/* ------------------------------------------------------------------ */

export function createWidgetTexture(
  scene: Scene,
  name: string,
  widget: WidgetSpec,
  pixelWidth: number,
  pixelHeight: number,
  selected = false
): DynamicTexture {
  const tex = new DynamicTexture(name, { width: pixelWidth * TEX_SCALE, height: pixelHeight * TEX_SCALE }, scene, true);
  tex.vScale = -1;
  tex.vOffset = 1;
  tex.hasAlpha = true;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.scale(TEX_SCALE, TEX_SCALE);
  paintWidget(ctx, widget, pixelWidth, pixelHeight, selected);
  tex.update(false);
  return tex;
}
