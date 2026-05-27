/**
 * BabylonJS adapter for `@particle-academy/fancy-3d`.
 *
 * Each widget kind paints onto a 2D HTMLCanvasElement that is uploaded to a
 * Babylon `DynamicTexture`, which is then applied to a plane mesh sized to
 * the widget's pixel rect. Edges become line meshes between node centers.
 *
 * `@babylonjs/core` is an OPTIONAL peer dependency — only consumers building
 * 3D scenes need to install it.
 */
import {
  Color3,
  DynamicTexture,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  type Mesh,
  type Scene as BJScene,
} from "@babylonjs/core";
import type {
  AdapterContext,
  Scene,
  SceneNode,
  WidgetAdapter,
  WidgetSpec,
} from "@particle-academy/fancy-3d";

import { TEX_SCALE, paintWidget } from "./painters";
export { TEX_SCALE, paintWidget } from "./painters";

const WORLD_SCALE = 1 / 180; // pixels → world units


/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

export interface BabylonAdapterDeps {
  scene3D: BJScene;
  /** Pixel size for the widget (the scene node's `size` field). */
  sizeFor(spec: WidgetSpec): { w: number; h: number };
}

export function createBabylonAdapter(deps: BabylonAdapterDeps): WidgetAdapter<Mesh> {
  return {
    render(spec: WidgetSpec, ctx: AdapterContext): Mesh {
      const { w, h } = deps.sizeFor(spec);
      const tex = new DynamicTexture(`tex-${ctx.nodeId}`, { width: w * TEX_SCALE, height: h * TEX_SCALE }, deps.scene3D, true);
      tex.hasAlpha = true;
      // Babylon plane UVs run V=0 at the bottom; canvas Y runs top-to-bottom.
      // Without this flip, painted content appears upside down on the mesh.
      tex.vScale = -1;
      tex.vOffset = 1;
      const c = tex.getContext() as CanvasRenderingContext2D;
      c.scale(TEX_SCALE, TEX_SCALE);
      paintWidget(c, spec, w, h, ctx.selected);
      tex.update(false);

      const mat = new StandardMaterial(`mat-${ctx.nodeId}`, deps.scene3D);
      mat.diffuseTexture = tex;
      mat.emissiveTexture = tex;
      mat.emissiveColor = new Color3(1, 1, 1);
      mat.disableLighting = false;
      mat.useAlphaFromDiffuseTexture = true;

      const plane = MeshBuilder.CreatePlane(`node-${ctx.nodeId}`, { width: w * WORLD_SCALE, height: h * WORLD_SCALE }, deps.scene3D);
      plane.material = mat;
      plane.metadata = { nodeId: ctx.nodeId, kind: spec.kind };
      return plane;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * "3D Desktop" layout — wraps the scene's 2D positions onto a partial
 * cylinder facing the camera. DOM `x` becomes angle around the cylinder,
 * DOM `y` becomes height.
 */
export function placeOnCylinder(node: SceneNode, mesh: Mesh, bounds: { minX: number; maxX: number; minY: number; maxY: number }, opts: { radius?: number; arc?: number } = {}) {
  const radius = opts.radius ?? 6;
  const arc = opts.arc ?? Math.PI * 0.9; // ~160°
  const rangeX = bounds.maxX - bounds.minX || 1;
  const rangeY = bounds.maxY - bounds.minY || 1;
  const cx = (node.position.x + (node.size?.w ?? 200) / 2 - bounds.minX) / rangeX;
  const cy = (node.position.y + (node.size?.h ?? 120) / 2 - bounds.minY) / rangeY;
  const angle = (cx - 0.5) * arc;
  const height = (0.5 - cy) * 6;
  mesh.position = new Vector3(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
  // Rotate the plane around Y so its FRONT face (default plane normal: +Z)
  // points outward — toward the orbiting camera. Babylon's `lookAt` aimed
  // the back of the plane at the target, which read as mirrored text.
  mesh.rotation = new Vector3(0, angle, 0);
}

export function sceneBounds(scene: Scene) {
  const xs = scene.nodes.map((n) => n.position.x);
  const ys = scene.nodes.map((n) => n.position.y);
  const xe = scene.nodes.map((n) => n.position.x + (n.size?.w ?? 200));
  const ye = scene.nodes.map((n) => n.position.y + (n.size?.h ?? 120));
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xe),
    minY: Math.min(...ys),
    maxY: Math.max(...ye),
  };
}


export * from "./primitives";

export * from "./layouts";
