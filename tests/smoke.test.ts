import { describe, it, expect } from "vitest";
import { ping } from "../src/smoke.js";

describe("smoke", () => {
  it("returns pong", () => {
    expect(ping()).toBe("pong");
  });
});
