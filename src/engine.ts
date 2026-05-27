/**
 * Babylon engine adapter for `@particle-academy/fancy-3d`'s <Canvas>.
 *
 * Mounts a Babylon `Engine` + `Scene` + camera into a `<canvas>` element
 * overlaid on the Canvas DOM container, then exposes the live `Scene` via
 * `EngineHandle.root` so child components can register meshes alongside the
 * 2D node graph.
 *
 *   import { Canvas } from "@particle-academy/fancy-3d";
 *   import { babylonEngine } from "@particle-academy/fancy-3d-babylon/engine";
 *
 *   <Canvas engine={babylonEngine} style={{ height: 480 }} />
 */
import type { CanvasEngine, EngineHandle, ViewportState } from "@particle-academy/fancy-3d";

// Declare a CJS-style `require` so the dts compiler doesn't reject the lazy
// load below. Browsers don't have `require`, but this whole engine adapter
// only runs when a host bundler (vite/webpack) replaces the call with its own
// lazy-module shim, or under node-side SSR where the global exists.
declare const require: (specifier: string) => unknown;

export const babylonEngine: CanvasEngine = {
  name: "babylon",
  mount(host: HTMLElement, viewport: ViewportState): EngineHandle {
    // Lazy require so non-babylon Canvas users don't pay the parse cost.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BABYLON: any = require("@babylonjs/core");

    const overlay = document.createElement("canvas");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.pointerEvents = "none";
    overlay.dataset.fancy3dCanvasEngine = "babylon";
    host.appendChild(overlay);

    const engine = new BABYLON.Engine(overlay, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

    const camera = new BABYLON.ArcRotateCamera(
      "fancy3d-canvas-camera",
      Math.PI / 2,
      Math.PI / 2.5,
      8,
      BABYLON.Vector3.Zero(),
      scene,
    );
    camera.attachControl(overlay, false);
    new BABYLON.HemisphericLight("fancy3d-canvas-light", new BABYLON.Vector3(0, 1, 0), scene);

    const observer = engine.runRenderLoop(() => scene.render());

    function updateViewport(_v: ViewportState) {
      // Default: 6DoF camera owns view; 2D viewport changes are observed
      // but don't move the Babylon camera. Consumers can override by
      // attaching their own observers to the scene.
    }

    function dispose() {
      try { engine.stopRenderLoop(observer as any); } catch {}
      scene.dispose();
      engine.dispose();
      if (overlay.parentElement === host) host.removeChild(overlay);
    }

    return {
      name: "babylon",
      root: scene,
      updateViewport,
      dispose,
    };
  },
};
