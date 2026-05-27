# @particle-academy/fancy-3d-babylon

Babylon.js adapter for [`@particle-academy/fancy-3d`](https://www.npmjs.com/package/@particle-academy/fancy-3d).

`fancy-3d` ships an engine-agnostic core (Scene types + a `CanvasEngine` interface + a DOM/CSS-3D renderer). This package adds a full WebGL renderer on top, plus the React components that mount onto a Babylon `Scene`: `Stage`, `Monitor`, `Card3D`, `Screen`, primitives, and layout helpers (`placeOnGrid`, `placeOnArc`, `placeOnWall`, `placeOnSphere`, `placeOnPath`).

> A Three.js / WebGPU / WebXR engine could ship as a sibling package: `fancy-3d-three`, `fancy-3d-webgpu`, etc. They implement the same `CanvasEngine` interface from the core; they don't depend on this one.

## Install

```bash
npm install @particle-academy/fancy-3d @particle-academy/fancy-3d-babylon @babylonjs/core
```

You always install three packages together: the core (types + `<Canvas>`), the Babylon adapter (this package), and Babylon itself. None of them pull in the others to keep the core lightweight for non-Babylon consumers.

## Usage

### Mount the Babylon engine on `<Canvas>`

```tsx
import { Canvas } from "@particle-academy/fancy-3d";
import { babylonEngine } from "@particle-academy/fancy-3d-babylon/engine";

<Canvas engine={babylonEngine} style={{ height: 480 }}>
  {/* 2D children are still allowed — Canvas hosts a DOM overlay
      alongside the WebGL view */}
</Canvas>
```

### Stage / Monitor / Card3D (React)

```tsx
import { Stage, Monitor, Card3D } from "@particle-academy/fancy-3d-babylon/react";
import { Card } from "@particle-academy/react-fancy";

<Stage camera={{ position: [0, 2, 5], target: [0, 0, 0] }}>
  <Monitor width={2} height={1.2} position={[0, 1, 0]}>
    <Card>
      <Card.Body>This react-fancy card renders as a live WebGL texture.</Card.Body>
    </Card>
  </Monitor>
  <Card3D position={[2, 0, 0]} rotation={[0, 30, 0]}>
    <h3>Children are plain React</h3>
  </Card3D>
</Stage>
```

### Layout helpers

```tsx
import { placeOnGrid, placeOnArc } from "@particle-academy/fancy-3d-babylon";

placeOnGrid(node, mesh, bounds, { cols: 4, gapX: 0.2, gapY: 0.2 });
placeOnArc(node, mesh, bounds, { radius: 3, startAngle: 0, endAngle: Math.PI });
```

## Why a separate package?

The core `fancy-3d` is engine-agnostic and lightweight (~80KB). Pulling in Babylon would force every consumer — including ones using only the DOM engine or shipping a custom Three.js adapter — to bundle ~13MB of WebGL runtime they don't use. The split keeps Babylon's cost paid only by Babylon consumers.

## License

MIT
