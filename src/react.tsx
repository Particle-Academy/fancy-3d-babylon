/**
 * `<Stage>` and `<Monitor>` — declarative React API for fancy-3d.
 *
 *   <Stage>
 *     <Monitor position={[0, 2, 0]} width={4} height={2.5}>
 *       <Card>...real react-fancy components...</Card>
 *     </Monitor>
 *   </Stage>
 *
 * `<Stage>` owns the Babylon engine + scene + render loop and exposes them
 * via context. `<Monitor>` builds a bezel mesh, projects its world-space
 * corners to screen space each frame, and renders its children into a
 * positioned DOM overlay. Children are real React: full interactivity,
 * accessibility, and styling — no canvas-rasterized snapshot.

 * Renamed from `<Screen>` in v0.3.0 to free the name for
 * `@particle-academy/fancy-screens`'s `<Screen>` (containerized application
 * surface). The behavior here is unchanged.
 *
 * Tradeoffs of mount mode (vs. painted texture):
 * - Pro: live, interactive, perfect text rendering.
 * - Con: HTML overlay always renders on top of the WebGL canvas; depth
 *   sorting against other 3D objects is approximate (we hide the overlay
 *   when the mesh is behind the camera or fully occluded by frustum).
 */
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  Scene as BJScene,
  StandardMaterial,
  Vector3,
  type Camera,
} from "@babylonjs/core";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/* 2D perspective transform — maps a unit rectangle to a 4-point quad */
/* via a 3x3 homography, packed into a CSS matrix3d for transform.    */
/* ------------------------------------------------------------------ */

type Mat3 = [number, number, number, number, number, number, number, number, number];

function adj3(m: Mat3): Mat3 {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ];
}

function multmm(a: Mat3, b: Mat3): Mat3 {
  const c: number[] = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let cij = 0;
      for (let k = 0; k < 3; k++) cij += a[3 * i + k] * b[3 * k + j];
      c[3 * i + j] = cij;
    }
  }
  return c as Mat3;
}

function multmv(m: Mat3, v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function basisToPoints(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): Mat3 {
  const m: Mat3 = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
  const v = multmv(adj3(m), [x4, y4, 1]);
  return multmm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/** Compute a homography that maps (0,0)→p1, (w,0)→p2, (w,h)→p3, (0,h)→p4. */
function quadToQuad(
  w: number, h: number,
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number
): Mat3 {
  const s = basisToPoints(0, 0, w, 0, w, h, 0, h);
  const d = basisToPoints(x1, y1, x2, y2, x3, y3, x4, y4);
  const t = multmm(d, adj3(s));
  // Normalize so t[8] is 1
  const n = t[8];
  for (let i = 0; i < 9; i++) t[i] /= n;
  return t;
}

/** Pack a 3x3 homography into a CSS matrix3d() string. */
function matrix3dString(t: Mat3): string {
  return `matrix3d(${t[0]}, ${t[3]}, 0, ${t[6]}, ${t[1]}, ${t[4]}, 0, ${t[7]}, 0, 0, 1, 0, ${t[2]}, ${t[5]}, 0, ${t[8]})`;
}

/* ------------------------------------------------------------------ */
/* Stage context                                                       */
/* ------------------------------------------------------------------ */

interface StageContextValue {
  engine: Engine;
  scene: BJScene;
  /** The HTML <canvas> the engine renders into — its bounding rect anchors overlays. */
  canvas: HTMLCanvasElement;
  /** Subscribe to per-frame ticks. Returns an unsubscribe fn. */
  onFrame(cb: () => void): () => void;
  /** The DOM container that screen overlays mount into. */
  overlayRoot: HTMLDivElement;
}

const StageContext = createContext<StageContextValue | null>(null);

export function useStage(): StageContextValue {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStage() must be called inside <Stage>");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

export interface StageProps {
  children?: ReactNode;
  /** Initial camera radius. Defaults to 10. */
  cameraRadius?: number;
  /** Initial camera target. Defaults to (0, 1.5, 0). */
  cameraTarget?: [number, number, number];
  /** Initial camera alpha (horizontal angle). Defaults to π/2. */
  cameraAlpha?: number;
  /** Initial camera beta (vertical angle). Defaults to π/2.4. */
  cameraBeta?: number;
  /** Background clear color. Defaults to a near-black. */
  clearColor?: string;
  /** Disable the default lights / camera if you want to set your own. */
  bare?: boolean;
  /** Callback after the scene is created — set up custom cameras, lights, meshes. */
  onReady?: (scene: BJScene) => void;
  className?: string;
  style?: CSSProperties;
}

export function Stage({
  children,
  cameraRadius = 10,
  cameraTarget = [0, 1.5, 0],
  cameraAlpha = Math.PI / 2,
  cameraBeta = Math.PI / 2.4,
  clearColor = "#06080f",
  bare = false,
  onReady,
  className,
  style,
}: StageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<StageContextValue | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
    const scene = new BJScene(engine);
    const c = Color4.FromHexString(clearColor);
    scene.clearColor = new Color4(c.r, c.g, c.b, 1);

    if (!bare) {
      const cam = new ArcRotateCamera(
        "fancy3d-cam",
        cameraAlpha,
        cameraBeta,
        cameraRadius,
        new Vector3(...cameraTarget),
        scene
      );
      cam.attachControl(canvas, true);
      cam.lowerRadiusLimit = 1;
      cam.upperRadiusLimit = 80;
      cam.wheelDeltaPercentage = 0.01;
      cam.upperBetaLimit = Math.PI / 2 - 0.05;

      const hemi = new HemisphericLight("fancy3d-hemi", new Vector3(0, 1, 0), scene);
      hemi.intensity = 0.7;
      hemi.diffuse = new Color3(0.7, 0.78, 1);
      hemi.groundColor = new Color3(0.1, 0.1, 0.18);

      const dir = new DirectionalLight("fancy3d-dir", new Vector3(-0.4, -1, -0.6), scene);
      dir.intensity = 0.6;
    }

    onReady?.(scene);

    const frameSubs = new Set<() => void>();
    scene.onBeforeRenderObservable.add(() => {
      frameSubs.forEach((cb) => cb());
    });

    engine.runRenderLoop(() => scene.render());
    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    setStage({
      engine,
      scene,
      canvas,
      overlayRoot: overlay,
      onFrame(cb) {
        frameSubs.add(cb);
        return () => frameSubs.delete(cb);
      },
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      engine.dispose();
      setStage(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
      data-fancy-3d-stage=""
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", outline: "none" }}
        tabIndex={0}
      />
      <div
        ref={overlayRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        data-fancy-3d-overlay-root=""
      />
      {stage && <StageContext.Provider value={stage}>{children}</StageContext.Provider>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Monitor — interactive mount point on a 3D mesh                      */
/* ------------------------------------------------------------------ */

export interface MonitorProps {
  children?: ReactNode;
  /** World-space center of the screen. */
  position: [number, number, number];
  /** Mesh dimensions in world units. */
  width: number;
  height: number;
  /** Y-axis rotation in radians. */
  rotationY?: number;
  /** Bezel color. Defaults to a near-black frame. */
  bezel?: string;
  /** Bezel thickness in world units. Defaults to 0.06. */
  bezelThickness?: number;
  /** Background color visible behind the React content. */
  background?: string;
  /** Design-time pixel width for the children. Defaults to `width * 360`. */
  pixelWidth?: number;
  /** Design-time pixel height for the children. Defaults to `height * 360`. */
  pixelHeight?: number;
  /** Optional name on the Babylon mesh. */
  name?: string;
}

export function Monitor({
  children,
  position,
  width,
  height,
  rotationY = 0,
  bezel = "#0b0f17",
  bezelThickness = 0.06,
  background = "#0b1220",
  pixelWidth,
  pixelHeight,
  name = "screen",
}: MonitorProps) {
  const stage = useStage();
  const meshRef = useRef<Mesh | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // Design-time pixel size for the children. The matrix3d transform maps
  // this unit rectangle onto the projected mesh quad each frame.
  const innerSize = useRef({
    w: pixelWidth ?? Math.max(120, Math.round(width * 360)),
    h: pixelHeight ?? Math.max(80, Math.round(height * 360)),
  });

  // Build the bezel + invisible projection-target plane.
  useEffect(() => {
    const { scene } = stage;
    const bezelMesh = MeshBuilder.CreateBox(`${name}-bezel`, {
      width: width + bezelThickness * 2,
      height: height + bezelThickness * 2,
      depth: bezelThickness,
    }, scene);
    bezelMesh.position = new Vector3(position[0], position[1], position[2]);
    bezelMesh.rotation.y = rotationY;
    const bezelMat = new StandardMaterial(`${name}-bezel-mat`, scene);
    bezelMat.diffuseColor = Color3.FromHexString(bezel);
    bezelMat.specularColor = new Color3(0.05, 0.05, 0.05);
    bezelMesh.material = bezelMat;

    // Inner pane the overlay tracks. Its background fills behind the React
    // overlay (in case the overlay is briefly mispositioned); the React
    // children are stamped on top.
    const pane = MeshBuilder.CreatePlane(`${name}-pane`, { width, height, sideOrientation: Mesh.DOUBLESIDE }, scene);
    pane.position = new Vector3(position[0], position[1], position[2]);
    pane.rotation.y = rotationY;
    // The bezel's "front" face is on +Z (default camera sits on +Z). Offset
    // the pane forward of that face so the React HTML overlay lines up with
    // the visible front of the bezel rather than its hidden back.
    const forward = new Vector3(0, 0, 1);
    const rot = Matrix.RotationY(rotationY);
    const offset = Vector3.TransformNormal(forward.scale(bezelThickness / 2 + 0.001), rot);
    pane.position.addInPlace(offset);
    const paneMat = new StandardMaterial(`${name}-pane-mat`, scene);
    paneMat.diffuseColor = Color3.FromHexString(background);
    paneMat.emissiveColor = Color3.FromHexString(background).scale(0.4);
    pane.material = paneMat;
    pane.metadata = { fancy3d: "screen", screenName: name };
    meshRef.current = pane;

    return () => {
      pane.dispose();
      bezelMesh.dispose();
      meshRef.current = null;
    };
  }, [stage, name, width, height, bezel, bezelThickness, background, position, rotationY]);

  // Each frame: project the four mesh corners and apply the matrix3d
  // transform that maps the inner div's local pixel space to the projected
  // quad. Imperative — no React re-render per frame.
  useEffect(() => {
    const unsub = stage.onFrame(() => {
      const mesh = meshRef.current;
      const overlay = overlayRef.current;
      if (!mesh || !overlay) return;
      const cam = stage.scene.activeCamera;
      if (!cam) return;
      const engine = stage.engine;
      const renderW = engine.getRenderWidth();
      const renderH = engine.getRenderHeight();
      const viewport = cam.viewport.toGlobal(renderW, renderH);
      const tm = stage.scene.getTransformMatrix();
      const identity = Matrix.Identity();
      const wm = mesh.getWorldMatrix();

      const halfW = width / 2;
      const halfH = height / 2;
      // Mesh-local corners ordered: top-left, top-right, bottom-right, bottom-left.
      // Babylon's plane: +Y is up in world (when not rotated around X), so
      // mesh-local +Y = top.
      const localCorners = [
        new Vector3(-halfW, halfH, 0),  // top-left
        new Vector3(halfW, halfH, 0),   // top-right
        new Vector3(halfW, -halfH, 0),  // bottom-right
        new Vector3(-halfW, -halfH, 0), // bottom-left
      ];
      const worldCorners = localCorners.map((v) => Vector3.TransformCoordinates(v, wm));

      // Edge-on cull only — hide overlay when the panel is nearly perpendicular
      // to the camera ray (where the projected quad collapses and matrix3d
      // becomes singular). The matrix3d transform handles both front and
      // back side rendering naturally, so we don't strictly cull by side.
      const camPos = cam.globalPosition;
      const right = worldCorners[1].subtract(worldCorners[0]);
      const up = worldCorners[0].subtract(worldCorners[3]);
      const normal = Vector3.Cross(up, right).normalize();
      const center = worldCorners[0].add(worldCorners[2]).scale(0.5);
      const toCam = camPos.subtract(center).normalize();
      const facing = Math.abs(Vector3.Dot(normal, toCam));

      const projected = worldCorners.map((c) => Vector3.Project(c, identity, tm, viewport));
      const inFrustum = projected.every((p) => p.z >= 0 && p.z <= 1);
      const visible = inFrustum && facing > 0.05;

      if (!visible) {
        if (overlay.style.display !== "none") overlay.style.display = "none";
        return;
      }

      // Depth-sort overlays: nearer-to-camera panels stack above farther ones.
      // Without this, DOM document order decides stacking and side screens
      // can render on top of the center screen even when 3D depth says
      // otherwise. NDC z is 0 at the near plane and 1 at the far plane, so
      // closer-to-camera = smaller z = higher z-index.
      const avgZ = (projected[0].z + projected[1].z + projected[2].z + projected[3].z) / 4;
      const depthZIndex = Math.round(Math.max(0, Math.min(1, 1 - avgZ)) * 100000);
      const zStr = String(depthZIndex);
      if (overlay.style.zIndex !== zStr) overlay.style.zIndex = zStr;

      const dpr = window.devicePixelRatio || 1;
      const w0 = innerSize.current.w;
      const h0 = innerSize.current.h;
      const t = quadToQuad(
        w0, h0,
        projected[0].x / dpr, projected[0].y / dpr,
        projected[1].x / dpr, projected[1].y / dpr,
        projected[2].x / dpr, projected[2].y / dpr,
        projected[3].x / dpr, projected[3].y / dpr
      );

      if (overlay.style.display !== "block") overlay.style.display = "block";
      overlay.style.transform = matrix3dString(t);
    });
    return unsub;
  }, [stage, width, height]);

  // Mount the overlay into the stage's overlay root.
  useLayoutEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (el.parentElement !== stage.overlayRoot) {
      stage.overlayRoot.appendChild(el);
    }
    return () => {
      if (el.parentElement === stage.overlayRoot) {
        stage.overlayRoot.removeChild(el);
      }
    };
  }, [stage]);

  return (
    <div
      ref={overlayRef}
      data-fancy-3d-screen={name}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: innerSize.current.w,
        height: innerSize.current.h,
        transformOrigin: "0 0",
        pointerEvents: "auto",
        overflow: "hidden",
        background,
        borderRadius: 4,
        display: "none",
      }}
    >
      {children}
    </div>
  );
}
