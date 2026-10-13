import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { socket } from "../socket";
import type { Stroke } from "../types";
import Toolbar from "./Toolbar";

// Everyone draws on the same 800 x 600 "logical" canvas.
// On screen it is scaled with CSS, so we convert mouse positions
// to 800 x 600 coordinates before sending them.
const WIDTH = 800;
const HEIGHT = 600;

interface CanvasProps {
  canDraw: boolean; // true only for the drawer while the phase is "drawing"
  children?: ReactNode; // overlay shown on top (word choice, round end...)
}

interface Point {
  x: number;
  y: number;
}

// A line someone else is drawing right now (from draw_data events)
interface RemoteLine {
  color: string;
  size: number;
  last: Point;
}

function Canvas({ canDraw, children }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false); // is the mouse button down?
  const lastRef = useRef<Point | null>(null); // last point we drew
  const remoteRef = useRef(new Map<number, RemoteLine>());

  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(8);
  const [erasing, setErasing] = useState(false);
  const brushColor = erasing ? "#ffffff" : color; // the eraser is just white paint

  // ---------- drawing helpers ----------

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  const drawDot = (p: Point, c: string, s: number) => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(p.x, p.y, s / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawLine = (from: Point, to: Point, c: string, s: number) => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.strokeStyle = c;
    ctx.lineWidth = s;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const clearAll = () => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  };

  // Draw a full list of strokes from scratch (after undo, or when joining late)
  const redraw = (strokes: Stroke[]) => {
    clearAll();
    for (const stroke of strokes) {
      const pts = stroke.points; // [x1, y1, x2, y2, ...]
      drawDot({ x: pts[0], y: pts[1] }, stroke.color, stroke.size);
      for (let i = 2; i < pts.length; i += 2) {
        drawLine({ x: pts[i - 2], y: pts[i - 1] }, { x: pts[i], y: pts[i + 1] }, stroke.color, stroke.size);
      }
    }
  };

  // ---------- events from the server ----------

  useEffect(() => {
    // Ask for everything drawn so far (we may have joined in the middle of a turn)
    socket.emit("get_canvas", (data: { strokes: Stroke[] }) => redraw(data.strokes));

    const onDrawData = (data: any) => {
      const p = { x: data.x, y: data.y };
      if (data.type === "start") {
        remoteRef.current.set(data.strokeId, { color: data.color, size: data.size, last: p });
        drawDot(p, data.color, data.size);
      } else if (data.type === "move") {
        const line = remoteRef.current.get(data.strokeId);
        if (!line) return;
        drawLine(line.last, p, line.color, line.size);
        line.last = p;
      } else {
        remoteRef.current.delete(data.strokeId);
      }
    };
    const onCanvasState = (data: { strokes: Stroke[] }) => redraw(data.strokes);
    const onCanvasClear = () => {
      remoteRef.current.clear();
      clearAll();
    };

    socket.on("draw_data", onDrawData);
    socket.on("canvas_state", onCanvasState);
    socket.on("canvas_clear", onCanvasClear);
    return () => {
      socket.off("draw_data", onDrawData);
      socket.off("canvas_state", onCanvasState);
      socket.off("canvas_clear", onCanvasClear);
    };
  }, []);

  // Time ran out while the mouse was still down → stop drawing
  useEffect(() => {
    if (!canDraw) drawingRef.current = false;
  }, [canDraw]);

  // ---------- mouse / touch (pointer events cover both) ----------

  // Screen position → 800 x 600 canvas position
  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * WIDTH),
      y: Math.round(((e.clientY - rect.top) / rect.height) * HEIGHT),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    e.currentTarget.setPointerCapture(e.pointerId); // keep getting moves even outside the canvas
    const p = toCanvasPoint(e);
    drawingRef.current = true;
    lastRef.current = p;
    drawDot(p, brushColor, size); // draw locally first, so it feels instant
    socket.emit("draw_start", { x: p.x, y: p.y, color: brushColor, size });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const last = lastRef.current;
    if (!drawingRef.current || !last) return;
    const p = toCanvasPoint(e);
    if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 2) return; // skip tiny moves = fewer messages
    drawLine(last, p, brushColor, size);
    lastRef.current = p;
    socket.emit("draw_move", { x: p.x, y: p.y });
  };

  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    socket.emit("draw_end");
  };

  return (
    <>
      <div className="board">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className={canDraw ? "can-draw" : ""}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {children}
      </div>

      {canDraw && (
        <Toolbar
          color={color}
          size={size}
          erasing={erasing}
          onColor={(c) => {
            setColor(c);
            setErasing(false);
          }}
          onSize={setSize}
          onEraser={() => setErasing(true)}
          onUndo={() => socket.emit("draw_undo")}
          onClear={() => socket.emit("canvas_clear")}
        />
      )}
    </>
  );
}

export default Canvas;