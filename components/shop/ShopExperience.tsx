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
import { layoutShop, type PlacedCrate } from "@/lib/shop/layout";
import { shopPath } from "@/lib/shop/share";
import { STICK_RANGE } from "@/lib/shop/stick";
import { isTouchDevice, type Aim, type Controls } from "./controls";
import { describe, type Interaction } from "./interact";
import { LoadingBar } from "./LoadingBar";
import { prepareSurfaces } from "./materials";
import { makePostcard, sharePostcard } from "./postcard";
import { restoreRig, saveRig, type Rig } from "./rig";
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

interface Held {
  album: Album;
  crateId: string;
  from: THREE.Object3D | null;
}

/**
 * The record shop: the scene, and everything you can do in it. Discrete state
 * — which crate you are in, what you are holding, what is playing — lives
 * here; the per-frame state of your body is in the rig, steered by the
 * musicmaze-style controls.
 */
export default function ShopExperience({ albums, username, visiting = false }: ShopExperienceProps) {
  const layout = useMemo(() => layoutShop(albums), [albums]);
  const crateById = useMemo(
    () => new Map(layout.crates.map((crate) => [crate.id, crate])),
    [layout.crates],
  );

  const [initialRig] = useState(() => restoreRig(username, layout));
  const rig = useRef<Rig>(initialRig);
  const scene = useRef<SceneHandle | null>(null);
  const controls = useRef<Controls | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [registry] = useState(() => new Map<number, THREE.Object3D>());
  const [ambience] = useState(() => new Ambience());

  const [entered, setEntered] = useState(false);
  const [locked, setLocked] = useState(false);
  const [digging, setDigging] = useState<{ crateId: string; index: number } | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [playing, setPlaying] = useState<{ album: Album; crateId: string } | null>(null);
  const [service, setService] = useState<ListenService>("spotify");
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<{ text: string; href?: string } | null>(null);
  const [info, setInfo] = useState<Album | null>(null);
  const [touch, setTouch] = useState(false);
  const [aimed, setAimed] = useState<Interaction | null>(null);
  const [petted, setPetted] = useState(0);
  // Getting ready: painting every surface, then compiling the scene, behind a
  // loading bar — so "step inside" opens straight onto a shop, not a freeze.
  const [prep, setPrep] = useState({ progress: 0, label: "Unpacking the stock" });
  const [surfacesReady, setSurfacesReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    prepareSurfaces(
      (done, label) => setPrep({ progress: done * 0.85, label }),
      () => cancelled,
    ).then(() => {
      if (!cancelled) setSurfacesReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [stick, setStick] = useState<{ x: number; y: number; vector: Aim } | null>(null);

  /** Where the floating thumb stick is, relative to the stage, for drawing it. */
  const showStick = useCallback((next: { origin: Aim; vector: Aim } | null) => {
    const rect = stage.current?.getBoundingClientRect();
    setStick(
      next && rect
        ? { x: next.origin.x - rect.left, y: next.origin.y - rect.top, vector: next.vector }
        : null,
    );
  }, []);

  // Preferences and the kind of device only exist in the browser.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setService(readListenService());
    setMuted(readMuted());
    setTouch(isTouchDevice());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => () => ambience.dispose(), [ambience]);
  useEffect(() => ambience.setMuted(muted), [ambience, muted]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.href ? 7000 : 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  // Remember where you were standing, as musicmaze does.
  useEffect(() => {
    const save = () => saveRig(username, rig.current);
    const timer = setInterval(save, 2000);
    window.addEventListener("pagehide", save);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [username]);

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

  const dugCrate = digging ? (crateById.get(digging.crateId) ?? null) : null;

  // --- Actions -------------------------------------------------------------

  const leaveCrate = useCallback(() => {
    rig.current.digging = null;
    setDigging(null);
  }, []);

  const startDig = useCallback(
    (crate: PlacedCrate) => {
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

  const digOrFlip = useCallback(
    (crate: PlacedCrate) => {
      if (digging?.crateId === crate.id) {
        flip(1);
        return;
      }
      // Hands full: the record you were carrying goes back where it came from.
      setHeld(null);
      startDig(crate);
    },
    [digging, flip, startDig],
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

  const playOrLift = useCallback(() => {
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

  const pet = useCallback(() => {
    ambience.purr();
    setPetted((n) => n + 1);
    setToast({ text: "Prrrrr." });
  }, [ambience]);

  /** A click with the pointer locked, or a tap: use whatever is under it. */
  const fire = useCallback(
    (aim: Aim) => {
      ambience.start();
      const target = scene.current?.pick(aim) ?? null;
      if (!target) return;
      if (target.kind === "crate") digOrFlip(target.crate);
      else if (target.kind === "deck") playOrLift();
      else pet();
    },
    [ambience, digOrFlip, playOrLift, pet],
  );

  const enter = () => {
    ambience.start();
    ambience.bell();
    setEntered(true);
    controls.current?.requestLock();
  };

  const resume = () => controls.current?.requestLock();

  const showDetails = (album: Album) => {
    controls.current?.releaseLock();
    setInfo(album);
  };

  const closeDetails = () => {
    setInfo(null);
    controls.current?.requestLock();
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

  // --- Keys that aren't walking ---------------------------------------------

  useEffect(() => {
    if (!entered) return;
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (info || target?.closest?.("input, textarea, select")) return;
      if (event.repeat && event.code !== "Space" && !event.code.startsWith("Arrow")) return;

      if (rig.current.digging) {
        if (["Space", "ArrowRight", "KeyD"].includes(event.code)) flip(1);
        else if (["ArrowLeft", "KeyA"].includes(event.code)) flip(-1);
        else if (["KeyE", "ArrowUp", "Enter", "KeyW"].includes(event.code)) pullOut();
        else if (["KeyS", "ArrowDown", "KeyQ", "Escape"].includes(event.code)) leaveCrate();
        else return;
        event.preventDefault();
        return;
      }
      if (event.code === "KeyR" && held) putBack();
      else if (event.code === "KeyI" && held && !visiting) showDetails(held.album);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });

  // --- What to show ----------------------------------------------------------

  const dugAlbums = dugCrate ? crateAlbums(dugCrate) : [];
  const upNow = digging ? dugAlbums[digging.index] : undefined;
  const serviceLabel = LISTEN_SERVICES.find((s) => s.id === service)?.label ?? "Spotify";

  const posters = useMemo(() => {
    // The first sleeve of each of the biggest genres: two framed on the wall,
    // the rest face-out on the record shelves as staff picks.
    const byGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    const picks: Album[] = [];
    for (let round = 0; round < 5 && picks.length < 8; round++) {
      for (const genre of byGenre) {
        const album = layout.crates
          .filter((c) => c.genre === genre)
          .flatMap((c) => c.albums)
          .filter((a) => a.coverImage && !picks.includes(a))[round];
        if (album) picks.push(album);
        if (picks.length >= 8) break;
      }
    }
    return picks;
  }, [genreCounts, layout.crates]);

  const verb = (() => {
    if (!aimed) return null;
    if (aimed.kind === "cat") return "Stroke";
    if (aimed.kind === "deck") return held ? "Put it on" : playing ? "Take it off" : null;
    return digging?.crateId === aimed.crate.id ? "Flick" : "Dig";
  })();

  return (
    <div className={styles.stage} ref={stage}>
      {surfacesReady ? (
        <ShopScene
          onReady={() => setSceneReady(true)}
          layout={layout}
          username={username}
          rig={rig}
          start={{ x: initialRig.x, z: initialRig.z }}
          posters={posters}
          digging={dugCrate && digging ? { crate: dugCrate, index: digging.index } : null}
          held={held}
          playing={playing?.album ?? null}
          away={away}
          registry={registry}
          handleRef={scene}
          controlsRef={controls}
          touch={touch}
          petted={petted}
          onFire={fire}
          onLockChange={setLocked}
          onStick={showStick}
          onAim={setAimed}
        />
      ) : null}

      {!sceneReady ? (
        <LoadingBar
          progress={surfacesReady ? 0.92 : prep.progress}
          label={surfacesReady ? "Switching on the lights" : prep.label}
        />
      ) : null}

      {entered && !touch ? (
        <div className={styles.crosshair} data-active={aimed !== null} aria-hidden="true">
          <span />
          {aimed ? (
            <p className={styles.aimLabel}>
              {verb ? <kbd>{verb}</kbd> : null} {describe(aimed)}
            </p>
          ) : null}
        </div>
      ) : null}

      {stick ? (
        <div className={styles.stick} style={{ left: stick.x, top: stick.y }} aria-hidden="true">
          <span
            style={{
              transform: `translate(${stick.vector.x * STICK_RANGE}px, ${stick.vector.y * STICK_RANGE}px)`,
            }}
          />
        </div>
      ) : null}

      {sceneReady && !entered ? (
        <div className={styles.welcome}>
          <div className={styles.welcomeCard}>
            <p className={styles.kicker}>{visiting ? "You're visiting" : "Welcome to"}</p>
            <h2 className={styles.shopName}>{username}&rsquo;s Records</h2>
            <p className={styles.welcomeText}>
              {albums.length.toLocaleString()} records in {layout.crates.length.toLocaleString()}{" "}
              crates across {genreCounts.size} {genreCounts.size === 1 ? "genre" : "genres"}. Dig
              through a crate, pull one out, and put it on the turntable in the back corner to
              play it.
            </p>
            <button type="button" className={styles.enter} onClick={enter} autoFocus>
              {touch ? "Tap to step inside" : "Click to step inside"}
            </button>
            <p className={styles.small}>
              {touch
                ? "Left thumb to walk · drag to look · tap to use"
                : "WASD to walk · mouse to look · Shift to hurry · click to use · Esc to pause"}
            </p>
          </div>
        </div>
      ) : null}

      {entered && !touch && !locked && !info ? (
        <div className={styles.paused}>
          <button type="button" className={styles.pausedCard} onClick={resume}>
            <span className={styles.kicker}>Paused</span>
            <span className={styles.pausedText}>Click to carry on browsing</span>
          </button>
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
              {touch || !locked ? (
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
              ) : null}
              <p className={styles.small}>
                {touch
                  ? "Tap the crate to flick through it"
                  : "Click or Space to flick · ← back one · E to pull it out · S to step back"}
              </p>
            </div>
          ) : held ? (
            <div className={styles.panel}>
              <p className={styles.crateName}>In your hands</p>
              <p className={styles.record}>
                <strong>{held.album.title}</strong> — {held.album.artist}
                {held.album.year ? ` (${held.album.year})` : ""}
              </p>
              {touch || !locked ? (
                <div className={styles.actions}>
                  {!visiting ? (
                    <button type="button" className="pill" onClick={() => showDetails(held.album)}>
                      Details
                    </button>
                  ) : null}
                  <button type="button" className="pill" onClick={putBack}>
                    Put it back
                  </button>
                </div>
              ) : null}
              <p className={styles.small}>
                {touch
                  ? `Tap the turntable in the back corner to play it on ${serviceLabel}`
                  : `Take it to the turntable in the back corner and click to play it on ${serviceLabel} · R to put it back${visiting ? "" : " · I for details"}`}
              </p>
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

      {info ? <AlbumDetail album={info} onClose={closeDetails} /> : null}
    </div>
  );
}
