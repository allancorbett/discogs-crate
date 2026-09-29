"use client";

import dynamic from "next/dynamic";
import type { Album } from "@/lib/discogs/types";
import { LoadingBar } from "./LoadingBar";
import styles from "./Shop.module.css";

/**
 * three.js and the scene are only fetched when someone opens the shop, so the
 * cover flow never pays for them.
 */
const ShopExperience = dynamic(() => import("./ShopExperience"), {
  ssr: false,
  loading: () => <LoadingBar progress={null} label="Unlocking the door" />,
});

interface Props {
  albums: Album[];
  username: string;
  /** Still fetching pages: the shelves are stocked once, when it's all in. */
  loading: boolean;
  loaded: number;
  total: number | null;
  visiting?: boolean;
}

export function ShopView({ albums, username, loading, loaded, total, visiting }: Props) {
  if (loading) {
    return (
      <div className={styles.stage}>
        <LoadingBar
          progress={total ? loaded / total : null}
          label={`Stocking the shelves: ${loaded.toLocaleString()}${total ? ` of ${total.toLocaleString()}` : ""} records`}
        />
      </div>
    );
  }

  return (
    <div className={styles.frame}>
      <ShopExperience albums={albums} username={username} visiting={visiting} />
    </div>
  );
}
