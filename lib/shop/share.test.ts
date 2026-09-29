import { describe, expect, it } from "vitest";
import { isDiscogsUsername, shopPath } from "./share";

describe("isDiscogsUsername", () => {
  it.each(["allan", "Allan_Corbett", "dj.shadow-1"])("accepts %s", (name) => {
    expect(isDiscogsUsername(name)).toBe(true);
  });

  it.each(["", "..", ".", "a/b", "../admin", "a b", "name?x=1", "a".repeat(65)])(
    "refuses %j",
    (name) => {
      expect(isDiscogsUsername(name)).toBe(false);
    },
  );

  it("refuses anything that is not a string", () => {
    expect(isDiscogsUsername(undefined)).toBe(false);
    expect(isDiscogsUsername(["allan"])).toBe(false);
  });
});

describe("shopPath", () => {
  it("links to the shop", () => {
    expect(shopPath("allan")).toBe("/shop/allan");
  });
});
