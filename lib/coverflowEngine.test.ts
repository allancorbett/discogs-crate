import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOT_COUNT } from "./coverflow";
import { CoverFlowEngine, type SlotElements } from "./coverflowEngine";
import type { Album } from "./discogs/types";

/**
 * The engine talks to the DOM directly — that is the whole point of it — so
 * what these tests need is a DOM, not a browser. The stub below is only as
 * real as the handful of properties the engine actually touches.
 *
 * Images count how often their `src` is written rather than just holding the
 * value, because the thing worth asserting is that a cover which hasn't
 * changed is never *reassigned*: writing an identical URL still costs a fetch
 * check and a decode, and doing that to every cover on every page of a large
 * import is what made one stutter.
 */

interface FakeImage {
  src: string | undefined;
  alt: string;
  style: Record<string, string>;
  writes: number;
  removeAttribute(name: string): void;
}

function fakeImage(): FakeImage {
  let src: string | undefined;
  return {
    alt: "",
    style: {},
    writes: 0,
    get src() {
      return src;
    },
    set src(value: string | undefined) {
      this.writes++;
      src = value;
    },
    removeAttribute(name: string) {
      if (name !== "src") return;
      this.writes++;
      src = undefined;
    },
  };
}

function fakeElement(offsetWidth = 200) {
  return {
    offsetWidth,
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    classList: { add() {}, remove() {} },
    firstElementChild: { textContent: "" },
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
  };
}

let nextId = 1;

function album(partial: Partial<Album> = {}): Album {
  const id = partial.id ?? nextId++;
  return {
    id,
    artist: "Artist",
    title: `Record ${id}`,
    year: null,
    coverImage: `https://img.example/${id}-full.jpg`,
    thumb: `https://img.example/${id}-thumb.jpg`,
    genres: [],
    styles: [],
    formats: [],
    labels: [],
    discogsUrl: "",
    ...partial,
  };
}

const page = (count: number) => Array.from({ length: count }, () => album());

function setUp(albums: Album[], onSettle: (index: number) => void = () => {}) {
  let current = albums;

  const slots = Array.from({ length: SLOT_COUNT }, () => ({
    root: fakeElement(),
    thumb: fakeImage(),
    hires: fakeImage(),
    reflection: fakeImage(),
  }));

  const engine = new CoverFlowEngine({
    stage: fakeElement() as unknown as HTMLElement,
    slots: slots as unknown as SlotElements[],
    draggingClass: "dragging",
    getAlbums: () => current,
    onCaption: () => {},
    onSettle,
    onSelect: () => {},
  });

  return {
    engine,
    slots,
    /** Another page of the collection arriving, as the component does it. */
    arrive(more: Album[]) {
      current = [...current, ...more];
      engine.refresh();
    },
    /** The same records re-filed — a sort or filter change. */
    replace(next: Album[]) {
      current = next;
      engine.refresh();
    },
    art: () => slots.map((slot) => slot.thumb.src),
    writes: () => slots.map((slot) => slot.thumb.writes),
    clearWrites() {
      for (const slot of slots) {
        slot.thumb.writes = 0;
        slot.hires.writes = 0;
      }
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
    addEventListener() {},
    removeEventListener() {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CoverFlowEngine", () => {
  it("fills its slots from the collection", () => {
    const harness = setUp(page(50));
    expect(harness.art().filter(Boolean)).toHaveLength(SLOT_COUNT);
    expect(harness.slots[0].root.dataset.index).toBe("0");
  });

  it("leaves a cover alone when the page that arrived didn't move it", () => {
    const harness = setUp(page(200));
    const before = harness.art();
    harness.clearWrites();

    harness.arrive(page(100));

    const after = harness.art();
    const untouched = after.filter(
      (src, index) => src === before[index] && harness.writes()[index] === 0,
    );

    // The carousel wraps, so the covers sitting behind the first record are
    // the tail of the collection and genuinely do change when it grows. Every
    // other slot — the centre and everything ahead of it — is showing the same
    // record as before and must not have been reloaded.
    expect(after.filter((src, index) => src === before[index])).toEqual(
      untouched,
    );
    expect(untouched.length).toBeGreaterThan(SLOT_COUNT / 2);
  });

  it("keeps the high-res upgrade on the centre cover across an arrival", () => {
    const harness = setUp(page(200));
    const centre = harness.slots[0];
    const upgraded = centre.hires.src;
    expect(upgraded).toBeDefined();
    harness.clearWrites();

    harness.arrive(page(100));

    expect(centre.hires.src).toBe(upgraded);
    expect(centre.hires.writes).toBe(0);
  });

  it("re-derives its slots when the collection is smaller than the carousel", () => {
    // With fewer records than slots the carousel wraps within them, so which
    // record a slot shows really does move when a page lands.
    const harness = setUp(page(3));
    expect(new Set(harness.art().filter(Boolean)).size).toBe(3);

    harness.arrive(page(2));
    expect(new Set(harness.art().filter(Boolean)).size).toBe(5);
  });

  it("loads the new artwork when the crate is re-filed", () => {
    const first = page(40);
    const harness = setUp(first);
    const before = harness.art();

    harness.replace([...first].reverse());

    expect(harness.art()).not.toEqual(before);
    expect(harness.art().filter(Boolean)).toHaveLength(SLOT_COUNT);
  });

  it("shows a record with no artwork as an empty slot", () => {
    const harness = setUp([album({ thumb: "", coverImage: "" })]);
    expect(harness.slots[0].thumb.src).toBeUndefined();
    expect(harness.slots[0].root.dataset.index).toBe("0");
  });
});

/**
 * A hand-cranked animation clock: frames only run when the test says so, each
 * exactly 1/60s after the last, so motion is deterministic.
 */
function fakeClock() {
  let now = 0;
  let queue: FrameRequestCallback[] = [];

  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queue.push(callback);
    return queue.length;
  });

  return {
    /** Runs frames until the loop stops asking for them, or `seconds` pass. */
    run(seconds = 10) {
      for (let elapsed = 0; elapsed < seconds && queue.length; elapsed += 1 / 60) {
        now += 1000 / 60;
        const frame = queue;
        queue = [];
        for (const callback of frame) callback(now);
      }
    },
    get idle() {
      return queue.length === 0;
    },
  };
}

/** The lean the engine has written into a slot's rotateY, net of its geometry. */
const rotation = (transform: string) =>
  Number(/rotateY\((-?[\d.]+)deg\)/.exec(transform)?.[1]);

describe("CoverFlowEngine motion", () => {
  it("comes to rest on the cover it was sent to, and says so once", () => {
    const clock = fakeClock();
    const settled: number[] = [];
    const harness = setUp(page(100), (index) => settled.push(index));

    harness.engine.goTo(7);
    clock.run();

    expect(clock.idle).toBe(true);
    expect(harness.engine.centreIndex).toBe(7);
    expect(settled).toEqual([7]);
  });

  it("stacks arrow presses made while it is still moving", () => {
    const clock = fakeClock();
    const harness = setUp(page(100));

    harness.engine.step(1);
    clock.run(0.05);
    harness.engine.step(1);
    harness.engine.step(1);
    clock.run();

    expect(harness.engine.centreIndex).toBe(3);
  });

  it("takes the short way round a wrapped collection", () => {
    const clock = fakeClock();
    const harness = setUp(page(100));

    harness.engine.goTo(97);
    clock.run();

    expect(harness.engine.centreIndex).toBe(97);
  });

  it("gets a long way across the crate without animating every record", () => {
    const clock = fakeClock();
    const harness = setUp(page(3000));

    harness.engine.goTo(1400);
    clock.run(4);

    expect(clock.idle).toBe(true);
    expect(harness.engine.centreIndex).toBe(1400);
  });

  it("lets the covers lean while moving and stand straight once stopped", () => {
    const clock = fakeClock();
    const harness = setUp(page(100));
    const centre = harness.slots[0].root;
    const upright = rotation(centre.style.transform);

    harness.engine.goTo(6);
    clock.run(0.1);
    // Mid-move, some cover near the middle should be turned by an angle that
    // no resting position gives it: neither square-on nor the side stack's.
    const leaning = harness.slots.some((slot) => {
      const angle = rotation(slot.root.style.transform);
      return Math.abs(angle) > 0.5 && Math.abs(angle) < 62 - 0.5;
    });
    expect(leaning).toBe(true);

    clock.run();
    expect(rotation(harness.slots[6].root.style.transform)).toBeCloseTo(upright, 2);
  });

  it("reaches the last record from a little way in", () => {
    const clock = fakeClock();
    const harness = setUp(page(120));

    harness.engine.goTo(15);
    clock.run();
    harness.engine.goTo(119);
    clock.run();

    expect(harness.engine.centreIndex).toBe(119);
  });

  it("jumps without moving when told not to animate", () => {
    const clock = fakeClock();
    const settled: number[] = [];
    const harness = setUp(page(100), (index) => settled.push(index));

    harness.engine.goTo(42, false);

    expect(clock.idle).toBe(true);
    expect(harness.engine.centreIndex).toBe(42);
    expect(settled).toEqual([42]);
  });
});
