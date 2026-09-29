"use client";

import Link from "next/link";
import { useCollection } from "@/hooks/useCollection";
import styles from "../Crate.module.css";
import { ShopView } from "./ShopView";

/** Someone else's shop, visited from a link they shared. */
export function SharedShop({ username }: { username: string }) {
  const { albums, loaded, total, loading, error, refresh } = useCollection(username, {
    endpoint: `/api/shop/${encodeURIComponent(username)}`,
    cacheKey: `shop:${username.toLowerCase()}`,
  });

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark}>Crate</span>
          <span className={styles.user}>Visiting {username}&rsquo;s shop</span>
        </div>
        <div className={styles.status}>
          <Link className={styles.link} href="/">
            Open your own shop
          </Link>
        </div>
      </header>

      {error ? (
        <div className={styles.empty}>
          <p role="alert">
            {error}{" "}
            <button type="button" className={styles.link} onClick={refresh}>
              Try again
            </button>
          </p>
        </div>
      ) : !loading && albums.length === 0 ? (
        <div className={styles.empty}>
          <p>{username} hasn&rsquo;t got any records in their shop yet.</p>
        </div>
      ) : (
        <ShopView
          albums={albums}
          username={username}
          loading={loading}
          loaded={loaded}
          total={total}
          visiting
        />
      )}
    </div>
  );
}
