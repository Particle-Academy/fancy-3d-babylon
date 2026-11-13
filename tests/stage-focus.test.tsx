import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Stage } from "../src/react";

// The Stage canvas is keyboard-focusable (tabIndex=0, the ArcRotateCamera
// attaches its controls to it) and carries an inline `outline: none`, which beats any stylesheet outline.
// A keyboard user tabbing onto it therefore saw nothing. The fix is a
// :focus-visible box-shadow ring (a separate property, so the inline outline
// does not cancel it). jsdom cannot evaluate :focus-visible, so these assert the
// shipped markup and rule. Server rendering never runs the WebGL effect.
const markup = () => renderToStaticMarkup(<Stage />);

describe("Stage canvas focus ring", () => {
  it("marks the focusable canvas with a stable handle", () => {
    const html = markup();
    expect(html).toMatch(/<canvas[^>]*data-fancy-3d-canvas=""[^>]*tabindex="0"|<canvas[^>]*tabindex="0"[^>]*data-fancy-3d-canvas=""/);
  });

  it("ships a :focus-visible box-shadow ring using the kit focus token", () => {
    const html = markup();
    const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(css).toMatch(/\[data-fancy-3d-canvas\]:focus-visible\s*\{[^}]*box-shadow:\s*inset 0 0 0 2px var\(--fancy-focus, var\(--color-blue-500/);
    expect(css).toMatch(/\[data-theme="dark"\]\)\s*\[data-fancy-3d-canvas\]:focus-visible\s*\{[^}]*var\(--fancy-focus-dark, var\(--color-blue-400/);
  });

  it("does not set box-shadow inline, which would override the ring", () => {
    const canvas = markup().match(/<canvas[^>]*>/)?.[0] ?? "";
    expect(canvas).not.toMatch(/box-shadow/);
  });
});
