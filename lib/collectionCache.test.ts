import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllCaches,
  clearCache,
  readCache,
  writeCache,
} from "./collectionCache";
import type { Album } from "./discogs/types";

/** A Storage good enough for the parts of the API the cache actually uses. */
const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() {
    return store.size;
  },
});

const album = (id: number): Album => ({
  id,
  artist: "Artist",
  title: `Record ${id}`,
  year: null,
  coverImage: "",
  thumb: "",
  genres: [],
  styles: [],
  formats: [],
  labels: [],
  discogsUrl: "",
});

const entry = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 2,
    savedAt: Date.now(),
    albums: [album(1)],
    ...overrides,
  });

beforeEach(() => {
  store.clear();
  // Force the setTimeout path, so a queued write is easy to let run or cancel.
  vi.stubGlobal("requestIdleCallback", undefined);
});

describe("readCache", () => {
  it("returns nothing when no crate has been stored", () => {
    expect(readCache("someone")).toBeNull();
  });

  it("returns a crate that is still fresh", () => {
    store.set("crate:collection:someone", entry());

    expect(readCache("someone")).toHaveLength(1);
  });

  it("drops an entry written by an older version of the app", () => {
    // An Album cached before unused fields were removed no longer matches the
    // shape the app now expects, so it must not be handed back.
    store.set("crate:collection:someone", entry({ version: 1 }));

    expect(readCache("someone")).toBeNull();
    expect(store.has("crate:collection:someone")).toBe(false);
  });

  it("drops an entry that has gone stale", () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    store.set("crate:collection:someone", entry({ savedAt: twoDaysAgo }));

    expect(readCache("someone")).toBeNull();
  });

  it("survives a corrupted entry rather than throwing", () => {
    store.set("crate:collection:someone", "{not json");

    expect(readCache("someone")).toBeNull();
  });
});

describe("clearCache", () => {
  it("removes only the named crate", () => {
    store.set("crate:collection:a", entry());
    store.set("crate:collection:b", entry());

    clearCache("a");

    expect(store.has("crate:collection:a")).toBe(false);
    expect(store.has("crate:collection:b")).toBe(true);
  });
});

describe("clearAllCaches", () => {
  it("removes every cached crate, not just the one signed in", () => {
    store.set("crate:collection:a", entry());
    store.set("crate:collection:b", entry());
    store.set("crate:collection:c", entry());

    clearAllCaches();

    expect(store.size).toBe(0);
  });

  it("leaves storage that isn't ours alone", () => {
    store.set("crate:collection:a", entry());
    store.set("unrelated", "keep me");

    clearAllCaches();

    expect(store.get("unrelated")).toBe("keep me");
    expect(store.has("crate:collection:a")).toBe(false);
  });

  it("cancels a queued write so it cannot land after the sweep", async () => {
    writeCache("a", [album(1)]);
    clearAllCaches();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(store.has("crate:collection:a")).toBe(false);
  });

  it("writes what it is given when nothing cancels it", async () => {
    writeCache("a", [album(1), album(2)]);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(readCache("a")).toHaveLength(2);
  });
});
