/**
 * Input, in two flavours — ported from musicmaze so walking round the shop
 * feels the same as walking round the maze.
 *
 * Desktop uses Pointer Lock with WASD/arrows, the standard first-person
 * arrangement, and a click aims from the crosshair in the middle of the
 * screen. Touch gets a floating thumb stick on the left to move and free drag
 * on the right to look, with a tap aiming wherever it lands. Both feed the
 * same intent, so the frame loop doesn't care which is in use.
 */

import { stickVector } from "@/lib/shop/stick";

export interface MoveIntent {
  /** -1 (back) to 1 (forward). */
  forward: number;
  /** -1 (left) to 1 (right). */
  strafe: number;
  /** Radians to add to yaw this frame. */
  yawDelta: number;
  /** Radians to add to pitch this frame. */
  pitchDelta: number;
}

/** Normalised device coordinates: where a click or tap was aimed. */
export interface Aim {
  x: number;
  y: number;
}

export const LOOK_SENSITIVITY = 0.0022;
/** How far a finger may wander and still count as a tap, in CSS pixels. */
const TAP_SLOP = 12;
const TOUCH_LOOK_SENSITIVITY = 0.0055;
export const MAX_PITCH = Math.PI / 2 - 0.05;

export function isTouchDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0)
  );
}

export class Controls {
  private readonly keys = new Set<string>();
  private yawDelta = 0;
  private pitchDelta = 0;
  private locked = false;
  private readonly cleanup: (() => void)[] = [];

  private moveTouchId: number | null = null;
  private moveOrigin = { x: 0, y: 0 };
  private moveVector = { x: 0, y: 0 };
  private lookTouchId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private readonly touches = new Map<number, { x: number; y: number; moved: number }>();

  readonly touch: boolean;
  /** While false, walking and looking are ignored (the crate has the camera). */
  enabled = true;

  onLockChange: ((locked: boolean) => void) | null = null;
  /**
   * A click or tap, delivered synchronously from inside the browser event —
   * which is what lets the turntable open a new tab without a popup blocker
   * stepping in.
   */
  onFire: ((aim: Aim) => void) | null = null;
  /** Where the thumb stick is, for drawing it. Null when no thumb is down. */
  onStick: ((stick: { origin: Aim; vector: Aim } | null) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.touch = isTouchDevice();
    this.bindKeyboard();
    if (this.touch) this.bindTouch();
    else this.bindMouse();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  requestLock(): void {
    if (this.touch || this.locked) return;
    try {
      const request = this.canvas.requestPointerLock() as unknown;
      // Chrome returns a promise that rejects if the request comes too soon
      // after the user left the lock; that is not worth an unhandled error.
      if (request instanceof Promise) request.catch(() => {});
    } catch {
      // Unsupported: the page is still usable, just without mouse look.
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
  ): void;
  private listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
  ): void;
  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  private listen(
    target: EventTarget,
    type: string,
    handler: (event: never) => void,
    options?: AddEventListenerOptions,
  ): void {
    const listener = handler as unknown as EventListener;
    target.addEventListener(type, listener, options);
    this.cleanup.push(() => target.removeEventListener(type, listener, options));
  }

  private bindKeyboard(): void {
    this.listen(window, "keydown", (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select")) return;
      this.keys.add(e.code);
      // Space and the arrows scroll the page otherwise.
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    });
    this.listen(window, "keyup", (e) => this.keys.delete(e.code));
    this.listen(window, "blur", () => this.keys.clear());
  }

  private bindMouse(): void {
    this.listen(document, "pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });

    this.listen(this.canvas, "mousemove", (e) => {
      if (!this.locked || !this.enabled) return;
      // Chrome can report one enormous jump as the lock engages (the distance
      // from wherever the cursor was); no hand moves a mouse that far in a
      // single event, so it is dropped rather than flinging the view round.
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      this.yawDelta -= e.movementX * LOOK_SENSITIVITY;
      this.pitchDelta -= e.movementY * LOOK_SENSITIVITY;
    });

    this.listen(this.canvas, "mousedown", (e) => {
      if (e.button !== 0) return;
      if (!this.locked) {
        this.requestLock();
        return;
      }
      // A locked pointer means the crosshair is always dead centre.
      this.onFire?.({ x: 0, y: 0 });
    });
  }

  private bindTouch(): void {
    const opts = { passive: false } as const;

    this.listen(
      this.canvas,
      "touchstart",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          this.touches.set(t.identifier, { x: t.clientX, y: t.clientY, moved: 0 });

          const leftSide = t.clientX < window.innerWidth * 0.45;
          if (leftSide && this.moveTouchId === null) {
            this.moveTouchId = t.identifier;
            this.moveOrigin = { x: t.clientX, y: t.clientY };
            this.moveVector = { x: 0, y: 0 };
            this.onStick?.({ origin: this.moveOrigin, vector: this.moveVector });
          } else if (!leftSide && this.lookTouchId === null) {
            this.lookTouchId = t.identifier;
            this.lookLast = { x: t.clientX, y: t.clientY };
          }
        }
        e.preventDefault();
      },
      opts,
    );

    this.listen(
      this.canvas,
      "touchmove",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          const tracked = this.touches.get(t.identifier);
          if (tracked) {
            tracked.moved += Math.abs(t.clientX - tracked.x) + Math.abs(t.clientY - tracked.y);
            tracked.x = t.clientX;
            tracked.y = t.clientY;
          }

          if (t.identifier === this.moveTouchId) {
            this.moveVector = stickVector(this.moveOrigin, { x: t.clientX, y: t.clientY });
            this.onStick?.({ origin: this.moveOrigin, vector: this.moveVector });
          } else if (t.identifier === this.lookTouchId) {
            if (this.enabled) {
              this.yawDelta -= (t.clientX - this.lookLast.x) * TOUCH_LOOK_SENSITIVITY;
              this.pitchDelta -= (t.clientY - this.lookLast.y) * TOUCH_LOOK_SENSITIVITY;
            }
            this.lookLast = { x: t.clientX, y: t.clientY };
          }
        }
        e.preventDefault();
      },
      opts,
    );

    const endTouch = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const tracked = this.touches.get(t.identifier);
        this.touches.delete(t.identifier);

        // Any finger that came back up without wandering is a tap, wherever
        // it landed — including one that happened to claim the stick.
        const tap = tracked !== undefined && tracked.moved < TAP_SLOP;
        if (tap && e.type !== "touchcancel") {
          const rect = this.canvas.getBoundingClientRect();
          this.onFire?.({
            x: ((t.clientX - rect.left) / rect.width) * 2 - 1,
            y: -(((t.clientY - rect.top) / rect.height) * 2 - 1),
          });
        }

        if (t.identifier === this.moveTouchId) {
          this.moveTouchId = null;
          this.moveVector = { x: 0, y: 0 };
          this.onStick?.(null);
        } else if (t.identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
      e.preventDefault();
    };
    this.listen(this.canvas, "touchend", endTouch, opts);
    this.listen(this.canvas, "touchcancel", endTouch, opts);
  }

  /** Read and clear this frame's input. */
  consume(): MoveIntent {
    let forward = 0;
    let strafe = 0;

    if (!this.enabled) {
      // Nothing carried over into the moment the crate lets go of the camera.
    } else if (this.touch) {
      strafe = this.moveVector.x;
      forward = -this.moveVector.y;
    } else if (this.locked) {
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) forward += 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) forward -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) strafe += 1;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) strafe -= 1;
      const length = Math.hypot(forward, strafe);
      if (length > 1) {
        forward /= length;
        strafe /= length;
      }
    }

    const intent = {
      forward,
      strafe,
      yawDelta: this.enabled ? this.yawDelta : 0,
      pitchDelta: this.enabled ? this.pitchDelta : 0,
    };
    this.yawDelta = 0;
    this.pitchDelta = 0;
    return intent;
  }

  /** True while a sprint key is held. */
  get sprinting(): boolean {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
  }

  dispose(): void {
    this.releaseLock();
    for (const undo of this.cleanup.splice(0)) undo();
  }
}
