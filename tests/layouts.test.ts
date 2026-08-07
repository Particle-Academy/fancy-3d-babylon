import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { sceneBounds } from "../src/index";
import { placeOnArc, placeOnGrid, placeOnWall } from "../src/layouts";
import type { Scene, SceneNode } from "@particle-academy/fancy-3d";

/**
 * The layouts only ever read and write `position` and `rotation`, so a plain
 * object stands in for a Mesh. Booting a Babylon engine to check arithmetic
 * would need a WebGL context that jsdom does not have.
 */
const mesh = (): Mesh =>
    ({ position: new Vector3(0, 0, 0), rotation: new Vector3(0, 0, 0) }) as unknown as Mesh;

const node = (x: number, y: number, w?: number, h?: number): SceneNode =>
    ({
        id: `n-${x}-${y}`,
        position: { x, y },
        size: w != null ? { w, h: h ?? 120 } : undefined,
        widget: { kind: "kpi" },
    }) as unknown as SceneNode;

const scene = (nodes: SceneNode[]): Scene => ({ nodes, edges: [] }) as unknown as Scene;

const BOUNDS = { minX: 0, maxX: 400, minY: 0, maxY: 240 };

describe("sceneBounds", () => {
    it("spans from each node's origin to its far corner", () => {
        const b = sceneBounds(scene([node(0, 0, 200, 120), node(300, 100, 200, 120)]));

        expect(b).toEqual({ minX: 0, maxX: 500, minY: 0, maxY: 220 });
    });

    it("assumes a default card size for a node that declares none", () => {
        const b = sceneBounds(scene([node(0, 0)]));

        expect(b.maxX).toBe(200);
        expect(b.maxY).toBe(120);
    });

    it("returns finite bounds for an empty scene", () => {
        // Math.min(...[]) is Infinity and Math.max(...[]) is -Infinity, so the
        // unguarded spread handed callers inverted infinite bounds; every layout
        // then centres on NaN and a NaN transform renders as nothing, making an
        // empty scene indistinguishable from a broken one.
        const b = sceneBounds(scene([]));

        expect(Number.isFinite(b.minX)).toBe(true);
        expect(Number.isFinite(b.maxX)).toBe(true);
        expect(Number.isFinite(b.minY)).toBe(true);
        expect(Number.isFinite(b.maxY)).toBe(true);
    });
});

describe("placeOnGrid", () => {
    it("puts a node centred in the bounds at the layout origin", () => {
        const m = mesh();
        placeOnGrid(node(100, 60, 200, 120), m, BOUNDS);

        expect(m.position.x).toBeCloseTo(0, 6);
        expect(m.position.y).toBeCloseTo(0, 6);
    });

    it("flips the y axis, because screen y grows downward and world y grows up", () => {
        const m = mesh();
        placeOnGrid(node(100, 200, 200, 120), m, BOUNDS);

        expect(m.position.y).toBeLessThan(0);
    });

    it("scales pixels into world units", () => {
        const a = mesh();
        const b = mesh();
        placeOnGrid(node(400, 60, 200, 120), a, BOUNDS, { scale: 1 / 120 });
        placeOnGrid(node(400, 60, 200, 120), b, BOUNDS, { scale: 1 / 60 });

        expect(Math.abs(b.position.x)).toBeCloseTo(Math.abs(a.position.x) * 2, 6);
    });

    it("offsets everything by the supplied origin", () => {
        const m = mesh();
        placeOnGrid(node(100, 60, 200, 120), m, BOUNDS, { origin: new Vector3(5, 6, 7) });

        expect(m.position.x).toBeCloseTo(5, 6);
        expect(m.position.y).toBeCloseTo(6, 6);
        expect(m.position.z).toBeCloseTo(7, 6);
    });
});

describe("placeOnArc", () => {
    it("puts the middle of the scene straight ahead on the arc", () => {
        const m = mesh();
        placeOnArc(node(100, 60, 200, 120), m, BOUNDS, { radius: 6 });

        expect(m.position.x).toBeCloseTo(0, 6);
        expect(m.position.z).toBeCloseTo(6, 6);
        expect(m.rotation.y).toBeCloseTo(0, 6);
    });

    it("turns each node to face the viewer as it moves round the arc", () => {
        // Position and rotation must use the SAME angle, or cards on the edges
        // sit correctly but face away.
        const m = mesh();
        placeOnArc(node(300, 60, 200, 120), m, BOUNDS, { radius: 6, arc: Math.PI });

        expect(m.rotation.y).not.toBe(0);
        expect(m.position.x).toBeCloseTo(Math.sin(m.rotation.y) * 6, 6);
        expect(m.position.z).toBeCloseTo(Math.cos(m.rotation.y) * 6, 6);
    });
});

describe("placeOnWall", () => {
    it("keeps the wall flat — no per-node rotation", () => {
        const m = mesh();
        placeOnWall(node(100, 60, 200, 120), m, BOUNDS);

        expect(m.rotation.y).toBe(0);
    });

    it("spreads across the wall and hangs it around eye height", () => {
        const left = mesh();
        const right = mesh();
        placeOnWall(node(0, 60, 200, 120), left, BOUNDS, { spreadX: 10 });
        placeOnWall(node(200, 60, 200, 120), right, BOUNDS, { spreadX: 10 });

        expect(left.position.x).toBeLessThan(right.position.x);
        expect(left.position.y).toBeCloseTo(1.5, 6);
    });
});
