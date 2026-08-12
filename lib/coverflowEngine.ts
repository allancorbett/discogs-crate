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
import type { Album } from "./discogs/types";

/**
 * The CoverFlow motion engine.
 *
 * This is deliberately plain DOM code rather than React. The carousel updates
 * every slot's transform on every animation frame, and routing that through
 * React state would mean a full render per frame during a drag or spin. React
 * owns the markup; this owns everything that moves.
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
}

interface Animation {
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
  ease: (t: number) => number;
  blur: boolean;
  resolve: () => void;
}

/** Velocity decay per second while coasting after a flick. */
const FRICTION = 6;
/** Spring constant pulling a resting carousel onto the nearest cover. */
const SNAP = 14;
const MAX_VELOCITY = 26;
/** Below this (covers/sec) coasting gives way to snapping. */
const COAST_FLOOR = 0.35;
const CLICK_SLOP_PX = 6;
const MAX_BLUR_PX = 3.5;
/** A cover this close to the centre is worth loading full-size art for. */
const HIRES_DISTANCE = 1.6;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export class CoverFlowEngine {
  private readonly options: EngineOptions;
  private readonly slots: SlotState[];

  private position = 0;
  private velocity = 0;
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
  private startPosition = 0;
  private lastX = 0;
  private lastMoveAt = 0;
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

    const plan = planSpin(this.position, index, count, this.reducedMotion);
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

    const to = this.position + shortestDelta(this.position, index, count);

    if (!animate || this.reducedMotion) {
      this.cancelAnimation();
      this.position = to;
      this.velocity = 0;
      this.paint();
      this.centre = wrapIndex(Math.round(to), count);
      this.options.onSettle(this.centre);
      return;
    }
    void this.animateTo(to, 480, easeOutQuint, false);
  }

  step(delta: number): void {
    this.cancelAnimation();
    this.velocity = 0;
    this.position = Math.round(this.position) + delta;
    this.start();
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

      const slotPos = slotPosition(index, this.position, activeSlots);
      const distance = slotPos - this.position;
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
          ` rotateY(${geometry.rotate.toFixed(2)}deg) scale(${geometry.scale.toFixed(4)})`,
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

    const centre = wrapIndex(Math.round(this.position), count);
    if (centre !== this.centre) {
      this.centre = centre;
      this.options.onCaption(centre);
    }
  }

  // -------------------------------------------------------------------------
  // Motion loop
  // -------------------------------------------------------------------------

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

    let blur = 0;
    let atRest = false;

    if (this.animation) {
      const animation = this.animation;
      const t = clamp((now - animation.startedAt) / animation.durationMs, 0, 1);
      const previous = this.position;

      this.position =
        animation.from + (animation.to - animation.from) * animation.ease(t);

      if (animation.blur) {
        const speed = Math.abs(this.position - previous) / (delta || 1);
        blur = clamp(speed * 0.05, 0, MAX_BLUR_PX);
      }

      if (t >= 1) {
        this.position = animation.to;
        this.animation = null;
        this.velocity = 0;
        atRest = true;
        animation.resolve();
      }
    } else if (this.dragging) {
      // Position is driven directly by pointermove.
    } else if (Math.abs(this.velocity) > COAST_FLOOR) {
      this.position += this.velocity * delta;
      this.velocity *= Math.exp(-FRICTION * delta);
    } else {
      this.velocity = 0;
      const target = Math.round(this.position);
      const gap = target - this.position;

      if (Math.abs(gap) > 0.0008) {
        this.position += gap * (1 - Math.exp(-SNAP * delta));
      } else {
        this.position = target;
        atRest = true;
      }
    }

    this.paint(blur);

    if (atRest) {
      this.running = false;
      this.options.onSettle(this.centreIndex);
    } else {
      requestAnimationFrame(this.frame);
    }
  };

  private cancelAnimation(): void {
    this.animation?.resolve();
    this.animation = null;
  }

  private animateTo(
    to: number,
    durationMs: number,
    ease: (t: number) => number,
    blur: boolean,
  ): Promise<void> {
    this.cancelAnimation();
    this.velocity = 0;

    return new Promise<void>((resolve) => {
      this.animation = {
        from: this.position,
        to,
        startedAt: performance.now(),
        durationMs: Math.max(durationMs, 1),
        ease,
        blur,
        resolve,
      };
      this.start();
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

    this.dragging = true;
    this.velocity = 0;
    this.startX = this.lastX = event.clientX;
    this.startPosition = this.position;
    this.lastMoveAt = performance.now();
    this.travelled = 0;
    this.options.stage.classList.add(this.options.draggingClass);
    this.start();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId || !this.dragging) return;

    const now = performance.now();
    const dt = Math.max((now - this.lastMoveAt) / 1000, 0.001);
    const dx = event.clientX - this.lastX;

    this.travelled += Math.abs(dx);
    this.position =
      this.startPosition - (event.clientX - this.startX) / this.pxPerCover;
    this.velocity = clamp(
      -dx / this.pxPerCover / dt,
      -MAX_VELOCITY,
      MAX_VELOCITY,
    );

    this.lastX = event.clientX;
    this.lastMoveAt = now;
    this.start();
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
      this.velocity = 0;
      if (pressed === this.centre) {
        this.options.onSelect(pressed);
      } else {
        this.goTo(pressed);
      }
      return;
    }

    // Releasing after a pause shouldn't fling.
    if (performance.now() - this.lastMoveAt > 120) this.velocity = 0;
    this.start();
  };

  // Trackpads send deltaX; a plain mouse wheel only sends deltaY, so both move
  // the carousel.
  private onWheel = (event: WheelEvent): void => {
    if (!this.count) return;
    event.preventDefault();
    this.cancelAnimation();

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;

    this.position += delta / (this.pxPerCover * 1.6);
    this.velocity = 0;
    this.paint();

    // Snap once the gesture stops rather than after every notch.
    if (this.wheelSettle) clearTimeout(this.wheelSettle);
    this.wheelSettle = setTimeout(() => this.start(), 90);
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
