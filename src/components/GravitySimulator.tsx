import { useEffect, useRef, useState, useCallback } from "react";

type Body = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  hue: number;
  trail: { x: number; y: number }[];
  alive: boolean;
};

const G = 0.6; // gravitational constant (tuned for visuals)
const SOFTENING = 8; // prevents singularities
const MAX_TRAIL = 120;
const GRID_SIZE = 36; // grid cell pixels
const WELL_STRENGTH = 1.6; // visual depth multiplier

let nextId = 1;

export default function GravitySimulator() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodiesRef = useRef<Body[]>([]);
  const pressRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
    startTime: number;
  } | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const [observation, setObservation] = useState<string>(
    "Press and hold to create an object. Drag to add velocity."
  );
  const [count, setCount] = useState(0);

  const setObs = useCallback((m: string) => setObservation(m), []);

  const reset = useCallback(() => {
    bodiesRef.current = [];
    setCount(0);
    setObs("Universe cleared. Press and hold to create an object.");
  }, [setObs]);

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current!;
    const handle = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      sizeRef.current = { w, h, dpr };
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    };
    handle();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  // Pointer interaction
  useEffect(() => {
    const canvas = canvasRef.current!;
    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const down = (e: PointerEvent) => {
      e.preventDefault();
      const { x, y } = getPos(e);
      pressRef.current = {
        active: true,
        startX: x,
        startY: y,
        curX: x,
        curY: y,
        startTime: performance.now(),
      };
      canvas.setPointerCapture(e.pointerId);
    };

    const move = (e: PointerEvent) => {
      if (!pressRef.current?.active) return;
      const { x, y } = getPos(e);
      pressRef.current.curX = x;
      pressRef.current.curY = y;
    };

    const up = (e: PointerEvent) => {
      const p = pressRef.current;
      if (!p?.active) return;
      const heldMs = performance.now() - p.startTime;
      const mass = Math.min(800, 20 + heldMs * 0.6);
      const dx = p.curX - p.startX;
      const dy = p.curY - p.startY;
      const vx = dx * 0.02;
      const vy = dy * 0.02;
      const hue = Math.floor(Math.random() * 360);
      bodiesRef.current.push({
        id: nextId++,
        x: p.startX,
        y: p.startY,
        vx,
        vy,
        mass,
        hue,
        trail: [],
        alive: true,
      });
      setCount(bodiesRef.current.filter((b) => b.alive).length);
      pressRef.current = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, []);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();

    const obsCooldown = { val: 0 };

    const step = (now: number) => {
      const dt = Math.min(32, now - last) / 16; // normalized
      last = now;
      const { w, h, dpr } = sizeRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // background
      ctx.fillStyle = "oklch(0.10 0.025 270)";
      ctx.fillRect(0, 0, w, h);

      const bodies = bodiesRef.current.filter((b) => b.alive);

      // physics
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        let ax = 0;
        let ay = 0;
        for (let j = 0; j < bodies.length; j++) {
          if (i === j) continue;
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy + SOFTENING * SOFTENING;
          const d = Math.sqrt(d2);
          const f = (G * b.mass) / d2;
          ax += (f * dx) / d;
          ay += (f * dy) / d;
        }
        a.vx += ax * dt;
        a.vy += ay * dt;
      }

      for (const b of bodies) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > MAX_TRAIL) b.trail.shift();
      }

      // collisions: merge if overlapping
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          if (!b.alive) continue;
          const ra = Math.cbrt(a.mass) * 1.4;
          const rb = Math.cbrt(b.mass) * 1.4;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < ra + rb) {
            const total = a.mass + b.mass;
            const big = a.mass >= b.mass ? a : b;
            const small = a.mass >= b.mass ? b : a;
            big.x = (a.x * a.mass + b.x * b.mass) / total;
            big.y = (a.y * a.mass + b.y * b.mass) / total;
            big.vx = (a.vx * a.mass + b.vx * b.mass) / total;
            big.vy = (a.vy * a.mass + b.vy * b.mass) / total;
            big.mass = total;
            big.hue = (big.hue + small.hue) / 2;
            small.alive = false;
            if (now - obsCooldown.val > 1500) {
              setObs("Collision! Two bodies merged into one — mass and momentum conserved.");
              obsCooldown.val = now;
            }
          }
        }
      }

      // off-screen cleanup
      for (const b of bodies) {
        if (b.x < -2000 || b.x > w + 2000 || b.y < -2000 || b.y > h + 2000) {
          b.alive = false;
          if (now - obsCooldown.val > 1500) {
            setObs(
              "Runaway body! Its velocity exceeded escape velocity and it left the system."
            );
            obsCooldown.val = now;
          }
        }
      }

      const liveBodies = bodies.filter((b) => b.alive);
      bodiesRef.current = liveBodies;

      // ---- Draw warped grid (spacetime) ----
      ctx.lineWidth = 1;
      ctx.strokeStyle = "oklch(0.45 0.12 240 / 0.55)";
      ctx.beginPath();

      const warp = (px: number, py: number) => {
        let dx = 0;
        let dy = 0;
        for (const b of liveBodies) {
          const rx = px - b.x;
          const ry = py - b.y;
          const d2 = rx * rx + ry * ry + 400;
          const f = (b.mass * WELL_STRENGTH) / d2;
          dx -= rx * f;
          dy -= ry * f;
        }
        // clamp
        const max = 60;
        if (dx > max) dx = max;
        else if (dx < -max) dx = -max;
        if (dy > max) dy = max;
        else if (dy < -max) dy = -max;
        return { x: px + dx, y: py + dy };
      };

      // horizontal lines
      for (let y = 0; y <= h + GRID_SIZE; y += GRID_SIZE) {
        let p = warp(0, y);
        ctx.moveTo(p.x, p.y);
        for (let x = GRID_SIZE; x <= w + GRID_SIZE; x += GRID_SIZE) {
          p = warp(x, y);
          ctx.lineTo(p.x, p.y);
        }
      }
      // vertical lines
      for (let x = 0; x <= w + GRID_SIZE; x += GRID_SIZE) {
        let p = warp(x, 0);
        ctx.moveTo(p.x, p.y);
        for (let y = GRID_SIZE; y <= h + GRID_SIZE; y += GRID_SIZE) {
          p = warp(x, y);
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();

      // ---- Draw trails ----
      for (const b of liveBodies) {
        if (b.trail.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < b.trail.length; i++) {
          const t = b.trail[i];
          if (i === 0) ctx.moveTo(t.x, t.y);
          else ctx.lineTo(t.x, t.y);
        }
        ctx.strokeStyle = `oklch(0.78 0.18 ${b.hue} / 0.55)`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // ---- Draw bodies ----
      for (const b of liveBodies) {
        const r = Math.cbrt(b.mass) * 1.4;
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 3);
        grad.addColorStop(0, `oklch(0.9 0.2 ${b.hue} / 0.6)`);
        grad.addColorStop(1, `oklch(0.9 0.2 ${b.hue} / 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `oklch(0.92 0.18 ${b.hue})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- Draw press-preview ----
      const p = pressRef.current;
      if (p?.active) {
        const heldMs = now - p.startTime;
        const mass = Math.min(800, 20 + heldMs * 0.6);
        const r = Math.cbrt(mass) * 1.4;
        ctx.strokeStyle = "oklch(0.92 0.18 320 / 0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.startX, p.startY, r, 0, Math.PI * 2);
        ctx.stroke();
        // velocity arrow
        ctx.beginPath();
        ctx.moveTo(p.startX, p.startY);
        ctx.lineTo(p.curX, p.curY);
        ctx.stroke();
        // arrowhead
        const ang = Math.atan2(p.curY - p.startY, p.curX - p.startX);
        const ah = 8;
        ctx.beginPath();
        ctx.moveTo(p.curX, p.curY);
        ctx.lineTo(
          p.curX - ah * Math.cos(ang - 0.4),
          p.curY - ah * Math.sin(ang - 0.4)
        );
        ctx.moveTo(p.curX, p.curY);
        ctx.lineTo(
          p.curX - ah * Math.cos(ang + 0.4),
          p.curY - ah * Math.sin(ang + 0.4)
        );
        ctx.stroke();
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setObs]);

  // sync count occasionally
  useEffect(() => {
    const i = setInterval(() => {
      setCount(bodiesRef.current.filter((b) => b.alive).length);
    }, 500);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />

      {/* HUD */}
      <header className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-5">
        <div className="pointer-events-auto">
          <div className="text-xs uppercase tracking-[0.3em] text-foreground/60">
            01 / Experiment ▸ Theory
          </div>
          <h1 className="mt-1 text-3xl font-normal tracking-tight">
            Gravity<span className="text-[oklch(0.78_0.22_320)]">/</span>
          </h1>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={reset}
            className="rounded-full border border-foreground/30 bg-background/40 px-4 py-1.5 text-xs uppercase tracking-widest backdrop-blur transition hover:border-foreground/70 hover:bg-foreground/10"
          >
            Restart
          </button>
        </div>
      </header>

      {/* Bottom info */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
        <div className="pointer-events-auto max-w-md">
          <div className="text-[10px] uppercase tracking-[0.3em] text-foreground/50">
            Observations
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground/85">
            {observation}
          </p>
        </div>
        <div className="pointer-events-auto text-right text-xs text-foreground/60">
          <div>Bodies: <span className="text-foreground">{count}</span></div>
          <div className="mt-1">Hold longer = more mass · Drag = velocity</div>
        </div>
      </footer>
    </div>
  );
}
