import {
  SLOT_COUNT,
  easeOutBack,
  easeOutQuint,
  geometryFor,
  planSpin,
  shortestDelta,
  slotPosition,
  wrapIndex,
} from "./coverflow";
import {
  FOLLOW_SPRING,
  FRICTION,
  HANDOFF_SPEED,
  SETTLE_SPRING,
  SETTLE_SPRING_CALM,
  coast,
  glideVelocity,
  isAtRest,
  leanFor,
  restingPoint,
  stepSpring,
  swaySpring,
  type Body,
} from "./coverflowPhysics";
import type { Album } from "./discogs/types";

/**
 * The CoverFlow motion engine.
 *
 * This is deliberately plain DOM code rather than React. The carousel updates
 * every slot's transform on every animation frame, and routing that through
 * React state would mean a full render per frame during a drag or spin. React
 * owns the markup; this owns everything that moves.
 *
 * Motion is simulated rather than tweened (see coverflowPhysics): a finger or
 * wheel pulls the carousel along on a stiff spring, a release lets it coast
 * under drag, and a softer spring catches it on a cover. Nothing has a fixed
 * duration — how long a move takes falls out of how hard it was thrown.
 */

export interface SlotElements {
  root: HTMLElement;
  thumb: HTMLImageElement;
  hires: HTMLImageElement;
  /** Only visible where -webkit-box-reflect is unsupported. */
  reflection: HTMLImageElement;
}

export interface EngineOptions {
  stage: HTMLElement;
  slots: SlotElements[];
  /** Read fresh each frame, since pages of the collection stream in. */
  getAlbums: () => Album[];
  /** Fires on every cover the carousel passes — for the live caption. */
  onCaption: (index: number) => void;
  /** Fires only once the carousel comes to rest. */
  onSettle: (index: number) => void;
  /** Activating the centre cover: click, Enter or Space. */
  onSelect: (index: number) => void;
  draggingClass: string;
}

interface SlotState extends SlotElements {
  albumIndex: number;
  /** Which record's artwork is actually loaded, independent of its position. */
  albumId: number | null;
  hiresRequested: boolean;
  /**
   * Last values written to the DOM. Assigning an identical string to
   * element.style still invalidates style on some engines, and at 23 slots ×
   * 4 properties × 60fps that is a lot of needless work — Safari especially.
   */
  lastTransform: string;
  lastOpacity: string;
  lastZIndex: string;
  lastFilter: string;
  lastDisplay: string;
  /** How far this cover is leaning, in degrees, and how fast that's changing. */
  sway: Body;
}

/**
 * - follow: tethered to a finger or wheel by a stiff spring.
 * - coast: thrown, and slowing under drag.
 * - settle: caught by the spring onto `target`.
 * - animation: a scripted spin (spinTo), the one thing that isn't simulated.
 */
type Mode = "follow" | "coast" | "settle" | "animation";

interface Animation {
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
  ease: (t: number) => number;
  blur: boolean;
  resolve: () => void;
}

const MAX_VELOCITY = 26;
/**
 * Seeks shorter than this are sprung straight onto; longer ones are thrown so
 * that they coast to rest on the target, the way a hand would do it.
 */
const SPRING_REACH = 2;
/** A seek further than this jumps most of the way first. */
const MAX_GLIDE = 40;
/** Sway this small, this slow, is invisible; stop simulating it. */
const SWAY_REST_DEGREES = 0.05;
const SWAY_REST_SPEED = 0.5;
const CLICK_SLOP_PX = 6;
const MAX_BLUR_PX = 3.5;
/** A cover this close to the centre is worth loading full-size art for. */
const HIRES_DISTANCE = 1.6;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export class CoverFlowEngine {
  private readonly options: EngineOptions;
  private readonly slots: SlotState[];

  private readonly body: Body = { position: 0, velocity: 0 };
  /** Where the carousel is headed: the finger, or the cover it will rest on. */
  private target = 0;
  private mode: Mode = "settle";
  /** onSettle has already been told about the current resting place. */
  private settleReported = true;
  private dragging = false;
  private animation: Animation | null = null;
  private running = false;
  private lastFrameAt = 0;
  private centre = -1;
  private pxPerCover = 160;
  private reducedMotion = false;
  private destroyed = false;
  /** Set by refresh(): every slot's album assignment needs re-deriving. */
  private stale = false;

  // Drag bookkeeping.
  private pointerId: number | null = null;
  private startX = 0;
  private startTarget = 0;
  private lastX = 0;
  private travelled = 0;
  /**
   * Which cover the press landed on. Recorded at pointerdown because
   * setPointerCapture retargets every later pointer event to the stage — by
   * pointerup, event.target no longer knows which cover was hit.
   */
  private pressedIndex: number | null = null;
  private wheelSettle: ReturnType<typeof setTimeout> | null = null;

  private readonly motionQuery: MediaQueryList;

  constructor(options: EngineOptions) {
    this.options = options;
    this.slots = options.slots.map((slot) => ({
      ...slot,
      albumIndex: -1,
      albumId: null,
      hiresRequested: false,
      lastTransform: "",
      lastOpacity: "",
      lastZIndex: "",
      lastFilter: "",
      lastDisplay: "",
      sway: { position: 0, velocity: 0 },
    }));

    this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = this.motionQuery.matches;
    this.motionQuery.addEventListener("change", this.onMotionPreference);

    const stage = options.stage;
    stage.addEventListener("pointerdown", this.onPointerDown);
    stage.addEventListener("pointermove", this.onPointerMove);
    stage.addEventListener("pointerup", this.onPointerUp);
    stage.addEventListener("pointercancel", this.onPointerUp);
    stage.addEventListener("wheel", this.onWheel, { passive: false });
    stage.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", this.measure);

    this.measure();
    this.paint();
  }

  destroy(): void {
    this.destroyed = true;
    this.running = false;
    this.animation?.resolve();
    this.animation = null;
    if (this.wheelSettle) clearTimeout(this.wheelSettle);

    const stage = this.options.stage;
    stage.removeEventListener("pointerdown", this.onPointerDown);
    stage.removeEventListener("pointermove", this.onPointerMove);
    stage.removeEventListener("pointerup", this.onPointerUp);
    stage.removeEventListener("pointercancel", this.onPointerUp);
    stage.removeEventListener("wheel", this.onWheel);
    stage.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.measure);
    this.motionQuery.removeEventListener("change", this.onMotionPreference);
  }

  // -------------------------------------------------------------------------
  // Public controls
  // -------------------------------------------------------------------------

  get centreIndex(): number {
    return Math.max(this.centre, 0);
  }

  /**
   * The collection changed — usually another page arriving. Wrapping depends
   * on the total, so every slot's album assignment has to be re-derived.
   *
   * Only the assignment, though: appending a page leaves most slots showing
   * the very record they were already showing, and reloading their artwork
   * anyway makes the whole carousel blink on every arrival. `applyAlbum`
   * compares the record before touching an image, so an unchanged slot costs
   * nothing here.
   */
  refresh(): void {
    this.stale = true;
    this.centre = -1;
    this.measure();
    this.paint();
  }

  /** Slot-machine spin onto an already-decided winner. */
  async spinTo(index: number): Promise<void> {
    const count = this.count;
    if (!count) return;

    const plan = planSpin(this.body.position, index, count, this.reducedMotion);
    await this.animateTo(
      plan.to,
      plan.durationMs,
      this.reducedMotion
        ? easeOutQuint
        : // Quint gives the long decelerating tail; the gentle back-ease on top
          // drifts a hair past the winner and settles onto it.
          (t) => easeOutBack(easeOutQuint(t), 0.35),
      !this.reducedMotion,
    );
  }

  goTo(index: number, animate = true): void {
    const count = this.count;
    if (!count) return;

    const to = this.body.position + shortestDelta(this.body.position, index, count);

    if (!animate || this.reducedMotion) {
      this.cancelAnimation();
      this.body.position = this.target = to;
      this.body.velocity = 0;
      this.mode = "settle";
      for (const slot of this.slots) slot.sway.position = slot.sway.velocity = 0;
      this.paint();
      this.centre = wrapIndex(Math.round(to), count);
      this.settleReported = true;
      this.options.onSettle(this.centre);
      return;
    }
    this.seek(Math.round(to));
  }

  step(delta: number): void {
    // Presses stack: a second arrow mid-move heads one further on from where
    // the first was going, not from wherever the carousel happens to be.
    const from = this.dragging ? this.body.position : this.target;
    this.seek(Math.round(from) + delta);
  }

  /** Sends the carousel to rest on `to`, sprung or thrown depending on range. */
  private seek(to: number): void {
    this.cancelAnimation();
    this.target = to;

    const distance = to - this.body.position;
    if (this.reducedMotion || Math.abs(distance) <= SPRING_REACH) {
      this.mode = "settle";
    } else {
      if (Math.abs(distance) > MAX_GLIDE) {
        this.body.position = to - Math.sign(distance) * MAX_GLIDE;
      }
      this.body.velocity = glideVelocity(this.body.position, to, FRICTION);
      this.mode = "coast";
    }
    this.wake();
  }

  // -------------------------------------------------------------------------
  // Painting
  // -------------------------------------------------------------------------

  private get count(): number {
    return this.options.getAlbums().length;
  }

  private measure = (): void => {
    const width = this.slots[0]?.root.offsetWidth;
    if (width) this.pxPerCover = width * 0.45;
  };

  private applyAlbum(slot: SlotState, albumIndex: number): void {
    const album = this.options.getAlbums()[albumIndex];
    const albumId = album?.id ?? null;
    const sameRecord = albumId !== null && albumId === slot.albumId;

    slot.albumIndex = albumIndex;
    if (album) slot.root.dataset.index = String(albumIndex);

    // The slot moved but the record on it didn't: the artwork it already
    // holds, high-res upgrade included, is still the right artwork.
    if (sameRecord) return;

    slot.albumId = albumId;
    slot.hiresRequested = false;
    slot.hires.style.opacity = "0";
    slot.hires.removeAttribute("src");

    if (!album) {
      slot.thumb.removeAttribute("src");
      slot.reflection.removeAttribute("src");
      return;
    }

    if (album.thumb) {
      slot.thumb.src = album.thumb;
      slot.thumb.alt = `${album.title} by ${album.artist}`;
      slot.reflection.src = album.thumb;
    } else {
      // Discogs has no art for this release; leave the image empty so the
      // titled tile behind it shows through.
      slot.thumb.removeAttribute("src");
      slot.thumb.alt = "";
      slot.reflection.removeAttribute("src");
    }

    const placeholder = slot.root.firstElementChild;
    if (placeholder) placeholder.textContent = album.title;
  }

  /** Writes a style property only when its value actually changed. */
  private write(
    slot: SlotState,
    cacheKey: "lastTransform" | "lastOpacity" | "lastZIndex" | "lastFilter" | "lastDisplay",
    property: "transform" | "opacity" | "zIndex" | "filter" | "display",
    value: string,
  ): void {
    if (slot[cacheKey] === value) return;
    slot[cacheKey] = value;
    slot.root.style[property] = value;
  }

  private paint(blurAmount = 0): void {
    const albums = this.options.getAlbums();
    const count = albums.length;
    if (!count) return;

    const activeSlots = Math.min(SLOT_COUNT, count);

    // Quantised so a drifting blur value doesn't rewrite the filter — and
    // therefore re-rasterise every cover — on frames where it barely moved.
    const blur = blurAmount ? `blur(${(Math.round(blurAmount * 4) / 4).toFixed(2)}px)` : "";

    for (let index = 0; index < this.slots.length; index++) {
      const slot = this.slots[index];

      if (index >= activeSlots) {
        this.write(slot, "lastDisplay", "display", "none");
        // A hidden slot is skipped below, so it can't be revalidated with the
        // rest; make sure it re-derives when the collection grows into it.
        slot.albumIndex = -1;
        continue;
      }
      this.write(slot, "lastDisplay", "display", "");

      const slotPos = slotPosition(index, this.body.position, activeSlots);
      const distance = slotPos - this.body.position;
      const albumIndex = wrapIndex(slotPos, count);

      if (slot.albumIndex !== albumIndex || this.stale) {
        this.applyAlbum(slot, albumIndex);
      }

      const geometry = geometryFor(distance);
      this.write(
        slot,
        "lastTransform",
        "transform",
        `translate3d(${(geometry.x * 100).toFixed(3)}%, 0, ${geometry.z.toFixed(2)}px)` +
          ` rotateY(${(geometry.rotate + slot.sway.position).toFixed(2)}deg)` +
          ` scale(${geometry.scale.toFixed(4)})`,
      );
      this.write(slot, "lastOpacity", "opacity", geometry.opacity.toFixed(3));
      this.write(slot, "lastZIndex", "zIndex", String(geometry.zIndex));
      this.write(slot, "lastFilter", "filter", blur);

      // Upgrade to full-size art near the centre. The high-res image fades in
      // over the thumbnail instead of replacing its src, so there is never a
      // flash of empty frame mid-drag.
      const album = albums[albumIndex];
      if (
        !slot.hiresRequested &&
        Math.abs(distance) < HIRES_DISTANCE &&
        album?.coverImage &&
        album.coverImage !== album.thumb
      ) {
        slot.hiresRequested = true;
        slot.hires.src = album.coverImage;
      }
    }

    this.stale = false;

    const centre = wrapIndex(Math.round(this.body.position), count);
    if (centre !== this.centre) {
      this.centre = centre;
      this.options.onCaption(centre);
    }
  }

  // -------------------------------------------------------------------------
  // Motion loop
  // -------------------------------------------------------------------------

  /** Something moved the carousel: run the loop and report where it lands. */
  private wake(): void {
    this.settleReported = false;
    this.start();
  }

  private start(): void {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.lastFrameAt = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    if (this.destroyed) return;

    const now = performance.now();
    const delta = Math.min((now - this.lastFrameAt) / 1000, 0.05);
    this.lastFrameAt = now;

    if (!this.count) {
      this.running = false;
      return;
    }

    const body = this.body;
    let blur = 0;

    switch (this.mode) {
      case "animation": {
        const animation = this.animation;
        if (!animation) {
          this.mode = "settle";
          break;
        }
        const t = clamp((now - animation.startedAt) / animation.durationMs, 0, 1);
        const previous = body.position;

        body.position =
          animation.from + (animation.to - animation.from) * animation.ease(t);
        // Not simulated, but the covers still swing to it.
        body.velocity = delta ? (body.position - previous) / delta : 0;

        if (animation.blur) {
          blur = clamp(Math.abs(body.velocity) * 0.05, 0, MAX_BLUR_PX);
        }

        if (t >= 1) {
          body.position = this.target = animation.to;
          body.velocity = 0;
          this.animation = null;
          this.mode = "settle";
          animation.resolve();
        }
        break;
      }
      case "follow":
        stepSpring(body, this.target, FOLLOW_SPRING, delta);
        break;
      case "coast":
        coast(body, FRICTION, delta);
        if (Math.abs(body.velocity) < HANDOFF_SPEED) {
          // Slow enough to catch: aim for whichever cover it was going to
          // drift to, so the spring finishes the throw rather than fighting it.
          this.target = Math.round(restingPoint(body, FRICTION));
          this.mode = "settle";
        }
        break;
      case "settle":
        stepSpring(
          body,
          this.target,
          this.reducedMotion ? SETTLE_SPRING_CALM : SETTLE_SPRING,
          delta,
        );
        if (isAtRest(body, this.target)) {
          body.position = this.target;
          body.velocity = 0;
        }
        break;
    }

    const swaying = this.swing(delta);
    this.paint(blur);

    const still =
      this.mode === "settle" &&
      body.position === this.target &&
      body.velocity === 0;

    if (still && !this.settleReported) {
      this.settleReported = true;
      this.options.onSettle(this.centreIndex);
    }

    if (still && !swaying) {
      this.running = false;
    } else {
      requestAnimationFrame(this.frame);
    }
  };

  /**
   * Lets each cover lean into the carousel's speed on its own spring. Returns
   * whether any of them is still visibly moving.
   */
  private swing(delta: number): boolean {
    const activeSlots = Math.min(SLOT_COUNT, this.count);
    let moving = false;

    for (let index = 0; index < activeSlots; index++) {
      const sway = this.slots[index].sway;

      if (this.reducedMotion) {
        sway.position = sway.velocity = 0;
        continue;
      }

      const distance =
        slotPosition(index, this.body.position, activeSlots) - this.body.position;
      stepSpring(sway, leanFor(this.body.velocity), swaySpring(distance), delta);

      if (
        Math.abs(sway.position) > SWAY_REST_DEGREES ||
        Math.abs(sway.velocity) > SWAY_REST_SPEED
      ) {
        moving = true;
      } else if (this.body.velocity === 0) {
        sway.position = sway.velocity = 0;
      }
    }
    return moving;
  }

  private cancelAnimation(): void {
    this.animation?.resolve();
    this.animation = null;
    if (this.mode === "animation") this.mode = "settle";
  }

  private animateTo(
    to: number,
    durationMs: number,
    ease: (t: number) => number,
    blur: boolean,
  ): Promise<void> {
    this.cancelAnimation();
    this.body.velocity = 0;

    return new Promise<void>((resolve) => {
      this.mode = "animation";
      this.animation = {
        from: this.body.position,
        to,
        startedAt: performance.now(),
        durationMs: Math.max(durationMs, 1),
        ease,
        blur,
        resolve,
      };
      this.wake();
    });
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onMotionPreference = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.count) return;

    const cover = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-index]",
    );
    const pressed = cover ? Number(cover.dataset.index) : NaN;
    this.pressedIndex = Number.isInteger(pressed) ? pressed : null;

    this.pointerId = event.pointerId;
    this.options.stage.setPointerCapture(event.pointerId);
    this.cancelAnimation();
    this.clearWheel();

    // Keep whatever momentum it has: catching a moving carousel should feel
    // like grabbing something heavy, not like it was never moving.
    this.dragging = true;
    this.mode = "follow";
    this.target = this.startTarget = this.body.position;
    this.startX = this.lastX = event.clientX;
    this.travelled = 0;
    this.options.stage.classList.add(this.options.draggingClass);
    this.wake();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId || !this.dragging) return;

    this.travelled += Math.abs(event.clientX - this.lastX);
    this.lastX = event.clientX;
    this.target =
      this.startTarget - (event.clientX - this.startX) / this.pxPerCover;
    this.wake();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;

    this.pointerId = null;
    this.dragging = false;
    this.options.stage.classList.remove(this.options.draggingClass);

    // A pointer that barely moved is a click, not a flick.
    const pressed = this.pressedIndex;
    this.pressedIndex = null;

    if (this.travelled < CLICK_SLOP_PX && pressed !== null) {
      if (pressed === this.centre) {
        this.target = Math.round(this.body.position);
        this.mode = "settle";
        this.wake();
        this.options.onSelect(pressed);
      } else {
        this.goTo(pressed);
      }
      return;
    }

    // Let go: it carries on at the speed the spring was dragging it. A finger
    // that stopped before lifting has already stopped the carousel with it,
    // so there is no stale flick to discard.
    this.body.velocity = clamp(this.body.velocity, -MAX_VELOCITY, MAX_VELOCITY);
    this.mode = "coast";
    this.wake();
  };

  private clearWheel(): void {
    if (this.wheelSettle) clearTimeout(this.wheelSettle);
    this.wheelSettle = null;
  }

  // Trackpads send deltaX; a plain mouse wheel only sends deltaY, so both move
  // the carousel. The wheel tows the carousel the same way a finger does, which
  // turns a notched mouse wheel's jumps into a push, and lets it coast when the
  // gesture ends.
  private onWheel = (event: WheelEvent): void => {
    if (!this.count || this.dragging) return;
    event.preventDefault();
    this.cancelAnimation();

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;

    if (this.mode !== "follow") this.target = this.body.position;
    this.mode = "follow";
    this.target += delta / (this.pxPerCover * 1.6);
    this.wake();

    // Release once the gesture stops rather than after every notch.
    this.clearWheel();
    this.wheelSettle = setTimeout(() => {
      this.wheelSettle = null;
      if (this.mode !== "follow" || this.dragging) return;
      this.body.velocity = clamp(this.body.velocity, -MAX_VELOCITY, MAX_VELOCITY);
      this.mode = "coast";
      this.wake();
    }, 90);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const count = this.count;
    if (!count) return;

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        return this.step(-1);
      case "ArrowRight":
        event.preventDefault();
        return this.step(1);
      case "PageUp":
        event.preventDefault();
        return this.step(-10);
      case "PageDown":
        event.preventDefault();
        return this.step(10);
      case "Home":
        event.preventDefault();
        return this.goTo(0);
      case "End":
        event.preventDefault();
        return this.goTo(count - 1);
      case "Enter":
      case " ":
        event.preventDefault();
        return this.options.onSelect(this.centreIndex);
    }
  };
}
