import type { WidgetSpec } from "@particle-academy/fancy-3d";

export const TEX_SCALE = 2; // retina-ish texture sharpness

/** Scale factor against the painters' design-time canvas (240px tall). All
 *  widget painters multiply their padding / font sizes by this so the layout
 *  looks the same at any pixel resolution. */
function unitOf(_w: number, h: number): number {
  return h / 240;
}

function paintCardBg(ctx: CanvasRenderingContext2D, w: number, h: number, selected: boolean) {
  const u = unitOf(w, h);
  ctx.fillStyle = "#0f172a";
  roundRect(ctx, 0, 0, w, h, 14 * u);
  ctx.fill();
  ctx.strokeStyle = selected ? "#6366f1" : "#1e293b";
  ctx.lineWidth = (selected ? 4 : 2) * u;
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 22px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(text.toUpperCase(), x, y);
}

function paintSparkline(ctx: CanvasRenderingContext2D, values: number[], x: number, y: number, w: number, h: number, variant: "line" | "bar" | "area", color: string) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = w / Math.max(values.length - 1, 1);

  if (variant === "bar") {
    const bw = w / values.length - 4;
    ctx.fillStyle = color;
    values.forEach((v, i) => {
      const bh = ((v - min) / range) * h;
      ctx.fillRect(x + i * (bw + 4), y + h - bh, bw, Math.max(bh, 1));
    });
    return;
  }

  ctx.beginPath();
  values.forEach((v, i) => {
    const px = x + i * step;
    const py = y + h - ((v - min) / range) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });

  if (variant === "area") {
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fillStyle = color + "44";
    ctx.fill();
    ctx.beginPath();
    values.forEach((v, i) => {
      const px = x + i * step;
      const py = y + h - ((v - min) / range) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
}
export function paintWidget(ctx: CanvasRenderingContext2D, spec: WidgetSpec, w: number, h: number, selected: boolean) {
  paintCardBg(ctx, w, h, selected);
  const pad = 20;

  switch (spec.kind) {
    case "kpi": {
      paintLabel(ctx, spec.label, pad, pad);
      ctx.fillStyle = "#f1f5f9";
      ctx.font = "700 56px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(spec.value, pad, pad + 32);
      if (spec.delta) {
        ctx.fillStyle = spec.trend === "up" ? "#10b981" : spec.trend === "down" ? "#f43f5e" : "#94a3b8";
        ctx.font = "600 22px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(spec.delta, pad, pad + 92);
      }
      break;
    }
    case "chart": {
      paintLabel(ctx, spec.title, pad, pad);
      paintSparkline(ctx, spec.series, pad, pad + 36, w - pad * 2, h - pad * 2 - 36, spec.variant, spec.color ?? "#6366f1");
      break;
    }
    case "kanban": {
      const colW = (w - pad * 2 - (spec.columns.length - 1) * 10) / spec.columns.length;
      spec.columns.forEach((col, i) => {
        const cx = pad + i * (colW + 10);
        ctx.fillStyle = "#1e293b";
        roundRect(ctx, cx, pad, colW, h - pad * 2, 8);
        ctx.fill();
        paintLabel(ctx, col.title, cx + 8, pad + 10);
        col.cards.forEach((c, j) => {
          ctx.fillStyle = "#0f172a";
          roundRect(ctx, cx + 8, pad + 44 + j * 38, colW - 16, 30, 6);
          ctx.fill();
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "500 20px ui-sans-serif, system-ui, sans-serif";
          ctx.fillText(c, cx + 16, pad + 50 + j * 38);
        });
      });
      break;
    }
    case "table": {
      paintLabel(ctx, spec.title, pad, pad);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 18px ui-sans-serif, system-ui, sans-serif";
      const colW = (w - pad * 2) / spec.columns.length;
      spec.columns.forEach((c, i) => ctx.fillText(c, pad + i * colW, pad + 38));
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "400 18px ui-sans-serif, system-ui, sans-serif";
      spec.rows.forEach((row, ri) => {
        row.forEach((cell, ci) => ctx.fillText(String(cell), pad + ci * colW, pad + 70 + ri * 28));
      });
      break;
    }
    case "profile": {
      ctx.fillStyle = "#6366f1";
      ctx.beginPath();
      ctx.arc(pad + 30, pad + 30, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 24px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(spec.initials, pad + 30, pad + 22);
      ctx.textAlign = "left";
      ctx.fillStyle = "#f1f5f9";
      ctx.font = "600 24px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(spec.name, pad + 76, pad + 12);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "400 20px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(spec.role, pad + 76, pad + 40);
      if (spec.status) {
        ctx.fillStyle = spec.status === "online" ? "#10b981" : spec.status === "away" ? "#f59e0b" : "#64748b";
        ctx.beginPath();
        ctx.arc(pad + 50, pad + 50, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "callout": {
      const tone = spec.tone === "danger" ? "#f43f5e" : spec.tone === "warning" ? "#f59e0b" : spec.tone === "success" ? "#10b981" : "#3b82f6";
      ctx.fillStyle = tone + "22";
      roundRect(ctx, 4, 4, w - 8, h - 8, 12);
      ctx.fill();
      ctx.fillStyle = tone;
      ctx.fillRect(12, 12, 4, h - 24);
      ctx.fillStyle = "#f1f5f9";
      ctx.font = "600 22px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(spec.title, 28, pad);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "400 18px ui-sans-serif, system-ui, sans-serif";
      wrapText(ctx, spec.body, 28, pad + 32, w - 40, 22);
      break;
    }
    case "form": {
      paintLabel(ctx, spec.title, pad, pad);
      spec.fields.forEach((f, i) => {
        const y = pad + 40 + i * 44;
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "500 18px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(f.label, pad, y);
        ctx.fillStyle = "#1e293b";
        roundRect(ctx, w - pad - 100, y - 4, 100, 28, 6);
        ctx.fill();
        if (f.type === "switch") {
          ctx.fillStyle = "#6366f1";
          roundRect(ctx, w - pad - 60, y - 4, 60, 28, 14);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(w - pad - 18, y + 10, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      break;
    }
    case "action": {
      paintLabel(ctx, spec.title, pad, pad);
      let bx = pad;
      const by = pad + 40;
      spec.buttons.forEach((b) => {
        const tw = ctx.measureText(b.label).width + 24;
        ctx.fillStyle = b.variant === "primary" ? "#6366f1" : b.variant === "ghost" ? "transparent" : "#1e293b";
        if (b.variant !== "ghost") {
          roundRect(ctx, bx, by, tw, 36, 8);
          ctx.fill();
        }
        ctx.fillStyle = b.variant === "primary" ? "#fff" : "#cbd5e1";
        ctx.font = "600 18px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(b.label, bx + 12, by + 9);
        bx += tw + 8;
      });
      break;
    }
    case "timeline": {
      paintLabel(ctx, spec.title, pad, pad);
      spec.events.forEach((e, i) => {
        const y = pad + 40 + i * 32;
        ctx.fillStyle = "#6366f1";
        ctx.beginPath();
        ctx.arc(pad + 4, y + 10, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#1e293b";
        if (i < spec.events.length - 1) {
          ctx.beginPath();
          ctx.moveTo(pad + 4, y + 14);
          ctx.lineTo(pad + 4, y + 32);
          ctx.stroke();
        }
        ctx.fillStyle = "#94a3b8";
        ctx.font = "500 14px ui-monospace, monospace";
        ctx.fillText(e.at, pad + 16, y);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "400 18px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(e.label, pad + 60, y);
      });
      break;
    }
    case "code": {
      paintLabel(ctx, spec.title, pad, pad);
      ctx.fillStyle = "#020617";
      roundRect(ctx, pad, pad + 36, w - pad * 2, h - pad * 2 - 36, 8);
      ctx.fill();
      ctx.fillStyle = "#a5b4fc";
      ctx.font = "400 16px ui-monospace, monospace";
      const lines = spec.code.split("\n");
      lines.forEach((ln, i) => ctx.fillText(ln, pad + 14, pad + 56 + i * 22));
      break;
    }
    case "image": {
      ctx.fillStyle = "#1e293b";
      roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 8);
      ctx.fill();
      ctx.fillStyle = "#64748b";
      ctx.font = "400 18px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(spec.alt, w / 2, h / 2);
      ctx.textAlign = "left";
      break;
    }
    case "text": {
      ctx.fillStyle = "#f1f5f9";
      ctx.font = "700 26px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(spec.heading, pad, pad);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "400 18px ui-sans-serif, system-ui, sans-serif";
      wrapText(ctx, spec.body, pad, pad + 38, w - pad * 2, 22);
      break;
    }
    case "screen": {
      const bezel = spec.bezel ?? "#0b0f17";
      const t = spec.bezelThickness ?? 14;
      const on = spec.on ?? true;
      const brightness = spec.brightness ?? (on ? 1 : 0.06);
      const bg = spec.background ?? "#020617";

      // Outer bezel
      ctx.fillStyle = bezel;
      roundRect(ctx, 0, 0, w, h, 18);
      ctx.fill();
      // Inner screen area
      const sx = t;
      const sy = t;
      const sw = w - t * 2;
      const sh = h - t * 2;
      ctx.save();
      ctx.fillStyle = bg;
      roundRect(ctx, sx, sy, sw, sh, 8);
      ctx.fill();
      ctx.beginPath();
      roundRect(ctx, sx, sy, sw, sh, 8);
      ctx.clip();
      ctx.translate(sx, sy);
      // Apply brightness as global alpha multiplier
      ctx.globalAlpha = brightness;
      const c = spec.content;
      if (c.type === "label") {
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "700 32px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(c.title, sw / 2, sh / 2 - (c.subtitle ? 16 : 0));
        if (c.subtitle) {
          ctx.fillStyle = "#94a3b8";
          ctx.font = "400 18px ui-sans-serif, system-ui, sans-serif";
          ctx.fillText(c.subtitle, sw / 2, sh / 2 + 18);
        }
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      } else if (c.type === "paint") {
        c.paint(ctx, sw, sh);
      } else if (c.type === "image") {
        // Image content is best painted by the consumer via "paint" — labels
        // serve as a fallback so the screen still has identifiable content.
        ctx.fillStyle = "#475569";
        ctx.font = "500 16px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(c.alt ?? "image", sw / 2, sh / 2);
        ctx.textAlign = "left";
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // Power LED
      ctx.fillStyle = on ? "#10b981" : "#475569";
      ctx.beginPath();
      ctx.arc(w - t - 6, h - t - 6, 4, 0, Math.PI * 2);
      ctx.fill();
      // Subtle glass reflection
      const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
      grad.addColorStop(0, "rgba(255,255,255,0.08)");
      grad.addColorStop(0.4, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      roundRect(ctx, sx, sy, sw, sh, 8);
      ctx.fill();
      break;
    }
    case "demoPage": {
      const u = unitOf(w, h);
      const padX = w * 0.06;
      const headerH = h * 0.22;
      const titleY = headerH + h * 0.12;
      const titleSize = h * 0.16;
      const descY = titleY + titleSize * 0.6;
      const descSize = h * 0.072;
      const descLine = descSize * 1.4;
      const chipSize = h * 0.052;
      const pathSize = h * 0.052;
      const ctaSize = h * 0.075;
      const ctaH = ctaSize * 2;

      // Accent header bar — slightly overlaps card top to visually anchor
      ctx.fillStyle = spec.accent;
      roundRect(ctx, 0, 0, w, headerH, 14 * u);
      ctx.fill();
      // Squared bottom on the accent bar (cancel rounded bottom corners)
      ctx.fillRect(0, headerH - 14 * u, w, 14 * u);

      // Category chip
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      const chipText = spec.category.toUpperCase();
      ctx.font = `700 ${chipSize}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      const chipPad = chipSize * 0.7;
      const chipW = ctx.measureText(chipText).width + chipPad * 2;
      const chipH = chipSize * 1.85;
      const chipY = (headerH - chipH) / 2;
      roundRect(ctx, padX, chipY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(chipText, padX + chipPad, chipY + (chipH - chipSize) / 2);

      // Path on right
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `500 ${pathSize}px ui-monospace, monospace`;
      const pathW = ctx.measureText(spec.path).width;
      ctx.fillText(spec.path, w - padX - pathW, chipY + (chipH - chipSize) / 2);

      // Title
      ctx.fillStyle = "#f8fafc";
      ctx.font = `800 ${titleSize}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(spec.name, padX, titleY);

      // Description (wrapped, clipped before reaching the CTA)
      ctx.fillStyle = "#94a3b8";
      ctx.font = `400 ${descSize}px ui-sans-serif, system-ui, sans-serif`;
      const ctaY = h - padX - ctaH;
      wrapText(ctx, spec.description, padX, descY, w - padX * 2, descLine, ctaY - descLine);

      // CTA at bottom
      ctx.fillStyle = spec.accent;
      const ctaText = "Open demo →";
      ctx.font = `600 ${ctaSize}px ui-sans-serif, system-ui, sans-serif`;
      const ctaTextPad = ctaSize * 0.9;
      const ctaW = ctx.measureText(ctaText).width + ctaTextPad * 2;
      roundRect(ctx, padX, ctaY, ctaW, ctaH, ctaH * 0.25);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.fillText(ctaText, padX + ctaTextPad, ctaY + (ctaH - ctaSize) / 2);
      ctx.textBaseline = "alphabetic";
      break;
    }
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  maxY?: number
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      if (maxY !== undefined && yy > maxY) return;
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line && (maxY === undefined || yy <= maxY)) ctx.fillText(line, x, yy);
}
