import { describe, expect, it } from "vitest";
import { coverProxyUrl, coverSource } from "./cover";

const COVER =
  "https://i.discogs.com/abc/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz.jpeg";

describe("coverSource", () => {
  it("accepts Discogs' image CDN", () => {
    expect(coverSource(COVER)?.hostname).toBe("i.discogs.com");
  });

  it.each([
    ["another host", "https://evil.example/cover.jpg"],
    ["a lookalike host", "https://i.discogs.com.evil.example/a.jpg"],
    ["a subdomain trick", "https://evil.i.discogs.com/a.jpg"],
    ["plain http", "http://i.discogs.com/a.jpg"],
    ["an explicit port", "https://i.discogs.com:8443/a.jpg"],
    ["embedded credentials", "https://user:pw@i.discogs.com/a.jpg"],
    ["a data URL", "data:image/png;base64,AAAA"],
    ["an internal address", "https://169.254.169.254/latest/meta-data"],
    ["garbage", "not a url"],
    ["nothing", ""],
  ])("refuses %s", (_label, raw) => {
    expect(coverSource(raw)).toBeNull();
  });

  it("refuses an absurdly long URL", () => {
    expect(coverSource(`${COVER}?${"a".repeat(3000)}`)).toBeNull();
  });
});

describe("coverProxyUrl", () => {
  it("routes a cover through our own origin", () => {
    expect(coverProxyUrl(COVER)).toBe(`/api/cover?u=${encodeURIComponent(COVER)}`);
  });

  it("has nothing for a record without art", () => {
    expect(coverProxyUrl("")).toBeNull();
    expect(coverProxyUrl(undefined)).toBeNull();
  });
});
