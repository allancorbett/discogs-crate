/**
 * Turns a frame of the shop into something worth posting: the view, with a
 * band along the bottom saying whose shop it is and what is in it.
 */

export interface PostcardInfo {
  username: string;
  records: number;
  genres: number;
  topGenre: string | null;
  nowPlaying: string | null;
  url: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function makePostcard(frame: string, info: PostcardInfo): Promise<Blob | null> {
  const image = await loadImage(frame);
  const band = Math.round(Math.max(120, image.width * 0.1));
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height + band;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0);

  ctx.fillStyle = "#140d09";
  ctx.fillRect(0, image.height, canvas.width, band);

  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const pad = Math.round(band * 0.3);
  const title = Math.round(band * 0.3);
  const small = Math.round(band * 0.16);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ff7ab8";
  ctx.shadowColor = "#ff4fa3";
  ctx.shadowBlur = 18;
  ctx.font = `italic 700 ${title}px ${family}`;
  ctx.fillText(`${info.username}'s Records`, pad, image.height + pad + title * 0.8);
  ctx.shadowBlur = 0;

  const facts = [
    `${info.records.toLocaleString()} records`,
    `${info.genres} ${info.genres === 1 ? "genre" : "genres"}`,
    info.topGenre ? `mostly ${info.topGenre}` : null,
    info.nowPlaying ? `now playing ${info.nowPlaying}` : null,
  ].filter(Boolean);

  ctx.fillStyle = "rgba(244,236,226,0.85)";
  ctx.font = `500 ${small}px ${family}`;
  ctx.fillText(facts.join(" · "), pad, image.height + pad + title + small * 1.2, canvas.width - pad * 2);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,204,77,0.9)";
  ctx.fillText(info.url, canvas.width - pad, image.height + pad + title * 0.8);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

/**
 * Hands the picture to the phone's share sheet where there is one, and
 * otherwise just downloads it.
 */
export async function sharePostcard(
  blob: Blob,
  filename: string,
  text: string,
): Promise<"shared" | "saved" | "cancelled"> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return "shared";
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return "cancelled";
      // Refused for some other reason: fall back to a download.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "saved";
}
