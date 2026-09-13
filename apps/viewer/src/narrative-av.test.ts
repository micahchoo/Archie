import { describe, expect, it } from "vitest";
import { narrativeSeekOf } from "./narrative-av.js";

describe("narrative AV starts", () => {
  it("passes a temporal section start to the media player, including video fragments", () => {
    expect(narrativeSeekOf("t=12.5,30")).toBe("t=12.5,30");
    expect(narrativeSeekOf("t=12.5,30&xywh=percent:1,2,3,4")).toBe("t=12.5,30");
  });
});
