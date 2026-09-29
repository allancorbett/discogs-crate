"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import { AlbumDetail } from "@/components/AlbumDetail";
import type { Album } from "@/lib/discogs/types";
import {
  LISTEN_SERVICES,
  isListenService,
  listenUrl,
  readListenService,
  writeListenService,
  type ListenService,
} from "@/lib/listen";
import { Ambience } from "@/lib/shop/ambience";
import { digStance, layoutShop, type PlacedCrate } from "@/lib/shop/layout";
import { findPath } from "@/lib/shop/path";
import { shopPath } from "@/lib/shop/share";
import { Joystick } from "./Joystick";
import { makePostcard, sharePostcard } from "./postcard";
import { createRig, type Rig } from "./rig";
import { ShopScene, type SceneHandle } from "./scene/ShopScene";
import styles from "./Shop.module.css";

export interface ShopExperienceProps {
  albums: Album[];
  username: string;
  /** Someone else's shop, through a shared link: look, don't open details. */
  visiting?: boolean;
}

const MUTE_KEY = "crate:shop-muted";

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Beyond this, tapping a crate walks you over to it first. */
const REACH = 2.6;

interface Held {
  album: Album;
  crateId: string;
  from: THREE.Object3D | null;
}

/**
 * The record shop: the scene, and everything you can do in it. Discrete state
 * — which crate you are in, what you are holding, what is playing — lives
 * here; the per-frame state of your body is in the rig.
 */
export default function ShopExperience({ albums, username, visiting = false }: ShopExperienceProps) {
  const layout = useMemo(() => layoutShop(albums), [albums]);
  const crateById = useMemo(
    () => new Map(layout.crates.map((crate) => [crate.id, crate])),
    [layout.crates],
  );

  const rig = useRef<Rig>(createRig(layout.spawn));
  const scene = useRef<SceneHandle | null>(null);
  const [registry] = useState(() => new Map<number, THREE.Object3D>());
  const [ambience] = useState(() => new Ambience());

  const [entered, setEntered] = useState(false);
  const [digging, setDigging] = useState<{ crateId: string; index: number } | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [playing, setPlaying] = useState<{ album: Album; crateId: string } | null>(null);
  const [service, setService] = useState<ListenService>("spotify");
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<{ text: string; href?: string } | null>(null);
  const [info, setInfo] = useState<Album | null>(null);
  const [touch, setTouch] = useState(false);

  // Preferences only exist in the browser, so they are read after mount.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setService(readListenService());
    setMuted(readMuted());
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => () => ambience.dispose(), [ambience]);
  useEffect(() => ambience.setMuted(muted), [ambience, muted]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.href ? 7000 : 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const away = useMemo(() => {
    const ids = new Set<number>();
    if (held) ids.add(held.album.id);
    if (playing) ids.add(playing.album.id);
    return ids;
  }, [held, playing]);

  const crateAlbums = useCallback(
    (crate: PlacedCrate) => crate.albums.filter((album) => !away.has(album.id)),
    [away],
  );

  const dugCrate = digging ? crateById.get(digging.crateId) ?? null : null;

  // --- Actions -------------------------------------------------------------

  /** Sets off walking somewhere, round the bins. */
  const walk = useCallback(
    (
      to: { x: number; z: number },
      extras: { then?: () => void; face?: { yaw: number; pitch: number } } = {},
    ) => {
      const r = rig.current;
      r.facing = null;
      r.walkTo = { path: findPath(layout, r, to) ?? [to], ...extras };
    },
    [layout],
  );

  const leaveCrate = useCallback(() => {
    if (rig.current.digging) rig.current.pitch = -0.3;
    rig.current.digging = null;
    setDigging(null);
  }, []);

  const startDig = useCallback(
    (crate: PlacedCrate) => {
      rig.current.walkTo = null;
      rig.current.digging = crate;
      setDigging({ crateId: crate.id, index: 0 });
      ambience.flick();
    },
    [ambience],
  );

  const flip = useCallback(
    (step: number) => {
      if (!digging || !dugCrate) return;
      const count = crateAlbums(dugCrate).length;
      if (count === 0) return;
      // Past the last record, the whole crate falls back to the front.
      const next = digging.index + step;
      const index = next >= count ? 0 : Math.max(0, next);
      if (index !== digging.index) ambience.flick();
      setDigging({ crateId: digging.crateId, index });
    },
    [digging, dugCrate, crateAlbums, ambience],
  );

  const tapCrate = useCallback(
    (crate: PlacedCrate) => {
      ambience.start();
      if (digging?.crateId === crate.id) {
        flip(1);
        return;
      }
      // Hands full: the record you were carrying goes back where it came from.
      setHeld(null);

      const stance = digStance(crate);
      const distance = Math.hypot(stance.x - rig.current.x, stance.z - rig.current.z);
      if (digging || distance <= REACH) {
        startDig(crate);
      } else {
        leaveCrate();
        walk(stance, { then: () => startDig(crate) });
      }
    },
    [ambience, digging, flip, startDig, leaveCrate, walk],
  );

  const pullOut = useCallback(() => {
    if (!digging || !dugCrate) return;
    const album = crateAlbums(dugCrate)[digging.index];
    if (!album) return;
    setHeld({ album, crateId: dugCrate.id, from: registry.get(album.id) ?? null });
    leaveCrate();
    ambience.lift();
  }, [digging, dugCrate, crateAlbums, registry, leaveCrate, ambience]);

  const putBack = useCallback(() => setHeld(null), []);

  const tapDeck = useCallback(() => {
    ambience.start();
    if (held) {
      // Straight from the click, so the browser treats it as the user's.
      const url = listenUrl(held.album, service);
      const tab = window.open(url, "_blank");
      if (tab) {
        tab.opener = null;
      } else {
        const label = LISTEN_SERVICES.find((s) => s.id === service)?.label ?? "it";
        setToast({ text: `Your browser blocked the new tab. Open in ${label} ↗`, href: url });
      }
      setPlaying({ album: held.album, crateId: held.crateId });
      setHeld(null);
      ambience.thunk();
      ambience.setPlaying(true);
      return;
    }
    if (playing) {
      setHeld({ album: playing.album, crateId: playing.crateId, from: null });
      setPlaying(null);
      ambience.setPlaying(false);
      ambience.lift();
      return;
    }
    setToast({ text: "Pull a record out of a crate first, then bring it here." });
  }, [ambience, held, playing, service]);

  const walkToDeck = useCallback(() => {
    leaveCrate();
    const x = layout.turntable.x - 0.35;
    const z = layout.turntable.z + layout.counter.depth / 2 + 0.6;
    walk(
      { x, z },
      {
        // Turn to the deck and look down at it on arrival.
        face: {
          yaw: Math.atan2(-(layout.turntable.x - x), -(layout.turntable.z - z)),
          pitch: -0.62,
        },
      },
    );
  }, [layout, leaveCrate, walk]);

  const tapFloor = useCallback(
    (point: { x: number; z: number }) => {
      ambience.start();
      if (digging) {
        leaveCrate();
        return;
      }
      walk(point);
    },
    [ambience, digging, leaveCrate, walk],
  );

  const pet = useCallback(() => {
    ambience.start();
    ambience.purr();
    setToast({ text: "Prrrrr." });
  }, [ambience]);

  const enter = () => {
    ambience.start();
    ambience.bell();
    setEntered(true);
  };

  const chooseService = (value: string) => {
    if (!isListenService(value)) return;
    setService(value);
    writeListenService(value);
  };

  const toggleMute = () => {
    ambience.start();
    setMuted((current) => {
      try {
        localStorage.setItem(MUTE_KEY, current ? "0" : "1");
      } catch {
        // Only a preference.
      }
      return !current;
    });
  };

  const shareUrl = () => `${window.location.origin}${shopPath(username)}`;

  const copyLink = async () => {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setToast({ text: "Link to your shop copied." });
    } catch {
      setToast({ text: url, href: url });
    }
  };

  const genreCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const crate of layout.crates) {
      counts.set(crate.genre, (counts.get(crate.genre) ?? 0) + crate.albums.length);
    }
    return counts;
  }, [layout.crates]);

  const snapshot = async () => {
    const frame = scene.current?.capture();
    if (!frame) return;
    const top = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const blob = await makePostcard(frame, {
      username,
      records: albums.length,
      genres: genreCounts.size,
      topGenre: top,
      nowPlaying: playing ? `${playing.album.artist} – ${playing.album.title}` : null,
      url: shareUrl().replace(/^https?:\/\//, ""),
    });
    if (!blob) return;
    const result = await sharePostcard(
      blob,
      `${username}-record-shop.jpg`,
      `Come dig through ${username}'s record shop: ${shareUrl()}`,
    );
    if (result === "saved") setToast({ text: "Snapshot saved." });
  };

  // --- Keyboard --------------------------------------------------------------

  const turning = useRef(0);

  useEffect(() => {
    if (!entered) return;
    const keys = new Set<string>();
    const typing = (event: KeyboardEvent) =>
      event.target instanceof HTMLElement &&
      /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName);

    const sync = () => {
      const input = rig.current.input;
      input.forward =
        (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
        (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
      input.strafe =
        (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
      // Arrows turn rather than strafe, which is kinder to one-handed walking.
      const turn = (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
      turning.current = turn;
    };

    const down = (event: KeyboardEvent) => {
      if (typing(event) || info) return;
      if (rig.current.digging) {
        if (event.code === "ArrowRight" || event.code === "Space" || event.code === "KeyD") {
          event.preventDefault();
          flip(1);
        } else if (event.code === "ArrowLeft" || event.code === "KeyA") {
          flip(-1);
        } else if (event.code === "Enter" || event.code === "KeyE" || event.code === "ArrowUp") {
          event.preventDefault();
          pullOut();
        } else if (event.code === "Escape" || event.code === "ArrowDown" || event.code === "KeyS") {
          leaveCrate();
        }
        return;
      }
      if (event.code === "Escape" && held) putBack();
      if (event.code.startsWith("Arrow") || event.code === "Space") event.preventDefault();
      keys.add(event.code);
      sync();
    };
    const up = (event: KeyboardEvent) => {
      keys.delete(event.code);
      sync();
    };
    const blur = () => {
      keys.clear();
      sync();
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      keys.clear();
      sync();
    };
  }, [entered, info, flip, pullOut, leaveCrate, held, putBack]);

  // Keyboard turning runs on its own clock so it is smooth, not key-repeat.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (turning.current && !rig.current.digging) {
        rig.current.yaw += turning.current * delta * 1.8;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // --- Looking around, and swiping in a crate --------------------------------

  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(
    null,
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    d.x = event.clientX;
    d.y = event.clientY;
    if (rig.current.digging) return;
    const r = rig.current;
    r.yaw += dx * 0.0042;
    r.pitch = Math.max(-1.1, Math.min(0.8, r.pitch + dy * 0.0036));
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== event.pointerId || !rig.current.digging) return;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    if (-dy > 60 && -dy > Math.abs(dx)) pullOut();
    else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) flip(dx < 0 ? 1 : -1);
  };

  // --- What to show ----------------------------------------------------------

  const dugAlbums = dugCrate ? crateAlbums(dugCrate) : [];
  const upNow = digging ? dugAlbums[digging.index] : undefined;
  const serviceLabel = LISTEN_SERVICES.find((s) => s.id === service)?.label ?? "Spotify";

  const posters = useMemo(() => {
    // The first record of each of the four biggest genres, framed.
    const biggest = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return biggest
      .map(([genre]) => layout.crates.find((c) => c.genre === genre)?.albums.find((a) => a.coverImage))
      .filter((album): album is Album => Boolean(album));
  }, [genreCounts, layout.crates]);

  return (
    <div
      className={styles.stage}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      <ShopScene
        layout={layout}
        username={username}
        rig={rig}
        posters={posters}
        digging={dugCrate && digging ? { crate: dugCrate, index: digging.index } : null}
        held={held}
        playing={playing?.album ?? null}
        away={away}
        registry={registry}
        handleRef={scene}
        onCrateTap={tapCrate}
        onDeckTap={tapDeck}
        onFloorTap={tapFloor}
        onPet={pet}
      />

      {!entered ? (
        <div className={styles.welcome}>
          <div className={styles.welcomeCard}>
            <p className={styles.kicker}>{visiting ? "You're visiting" : "Welcome to"}</p>
            <h2 className={styles.shopName}>{username}&rsquo;s Records</h2>
            <p className={styles.welcomeText}>
              {albums.length.toLocaleString()} records in {layout.crates.length.toLocaleString()}{" "}
              crates across {genreCounts.size} {genreCounts.size === 1 ? "genre" : "genres"}. Tap a
              crate to dig, pull one out, and drop it on the turntable in the back corner to play
              it.
            </p>
            <button type="button" className={styles.enter} onClick={enter} autoFocus>
              Step inside
            </button>
            <p className={styles.small}>
              {touch
                ? "Stick to walk · drag to look · tap the floor to walk there"
                : "WASD to walk · drag to look · click the floor to walk there"}
            </p>
          </div>
        </div>
      ) : null}

      {entered ? (
        <>
          <div className={styles.topBar}>
            <label className={styles.service}>
              <span className={styles.serviceLabel}>Plays on</span>
              <select value={service} onChange={(e) => chooseService(e.target.value)}>
                {LISTEN_SERVICES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="pill"
              onClick={toggleMute}
              aria-pressed={!muted}
              aria-label={muted ? "Turn sound on" : "Turn sound off"}
            >
              {muted ? "Sound off" : "Sound on"}
            </button>
            <button type="button" className="pill" onClick={snapshot}>
              Snapshot
            </button>
            <button type="button" className="pill" onClick={copyLink}>
              {visiting ? "Copy link" : "Share shop"}
            </button>
          </div>

          {digging && dugCrate ? (
            <div className={styles.panel}>
              <p className={styles.crateName}>
                {dugCrate.genre}
                {dugCrate.parts > 1 ? ` · crate ${dugCrate.part} of ${dugCrate.parts}` : ""}
              </p>
              {upNow ? (
                <p className={styles.record}>
                  <span className={styles.count}>
                    {digging.index + 1}/{dugAlbums.length}
                  </span>{" "}
                  <strong>{upNow.title}</strong> — {upNow.artist}
                  {upNow.year ? ` (${upNow.year})` : ""}
                </p>
              ) : (
                <p className={styles.record}>This crate is empty.</p>
              )}
              <div className={styles.actions}>
                <button type="button" className="pill" onClick={() => flip(-1)} aria-label="Previous record">
                  ‹
                </button>
                <button type="button" className="pill" data-active="true" onClick={pullOut} disabled={!upNow}>
                  Pull it out
                </button>
                <button type="button" className="pill" onClick={() => flip(1)} aria-label="Next record">
                  ›
                </button>
                <button type="button" className="pill" onClick={leaveCrate}>
                  Step back
                </button>
              </div>
              <p className={styles.small}>
                {touch
                  ? "Tap the crate to flick · swipe up to pull one out"
                  : "Click or → to flick · ↑ or Enter to pull out · Esc to step back"}
              </p>
            </div>
          ) : held ? (
            <div className={styles.panel}>
              <p className={styles.crateName}>In your hands</p>
              <p className={styles.record}>
                <strong>{held.album.title}</strong> — {held.album.artist}
                {held.album.year ? ` (${held.album.year})` : ""}
              </p>
              <div className={styles.actions}>
                <button type="button" className="pill" data-active="true" onClick={walkToDeck}>
                  Take it to the turntable
                </button>
                {!visiting ? (
                  <button type="button" className="pill" onClick={() => setInfo(held.album)}>
                    Details
                  </button>
                ) : null}
                <button type="button" className="pill" onClick={putBack}>
                  Put it back
                </button>
              </div>
              <p className={styles.small}>Tap the turntable to put it on — it plays on {serviceLabel}.</p>
            </div>
          ) : null}

          {playing ? (
            <div className={styles.nowPlaying}>
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.npText}>
                Now playing <strong>{playing.album.title}</strong> — {playing.album.artist}
              </span>
              <a
                className={styles.npLink}
                href={listenUrl(playing.album, service)}
                target="_blank"
                rel="noreferrer noopener"
              >
                {serviceLabel} ↗
              </a>
            </div>
          ) : null}

          {touch && !digging ? <Joystick rigRef={rig} raised={held !== null} /> : null}
        </>
      ) : null}

      {toast ? (
        <div className={styles.toast} role="status">
          {toast.href ? (
            <a href={toast.href} target="_blank" rel="noreferrer noopener">
              {toast.text}
            </a>
          ) : (
            toast.text
          )}
        </div>
      ) : null}

      {info ? <AlbumDetail album={info} onClose={() => setInfo(null)} /> : null}
    </div>
  );
}
