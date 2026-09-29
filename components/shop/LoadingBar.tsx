import styles from "./Shop.module.css";

/**
 * Progress while the shop gets ready. `progress` of null is an indeterminate
 * bar, for the part (downloading the scene's code) nothing can measure.
 */
export function LoadingBar({ progress, label }: { progress: number | null; label: string }) {
  return (
    <div className={styles.loading}>
      <div className={styles.loadingCard}>
        <p className={styles.loadingLabel}>{label}…</p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label="Opening the shop"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
          data-indeterminate={progress === null}
        >
          <span style={progress === null ? undefined : { transform: `scaleX(${progress})` }} />
        </div>
      </div>
    </div>
  );
}
