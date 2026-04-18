import { describe, it, expect } from "vitest";
import { AppError, isAppError, toErrorPayload } from "./errors";

describe("AppError", () => {
  it("captures code, status, message, and cause", () => {
    const cause = new Error("underlying");
    const err = new AppError("db_error", 500, "DBに接続できません", cause);
    expect(err.code).toBe("db_error");
    expect(err.status).toBe(500);
    expect(err.message).toBe("DBに接続できません");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("AppError");
  });

  it("is a subclass of Error", () => {
    const err = new AppError("x", 400, "y");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("isAppError", () => {
  it("returns true for AppError instances", () => {
    expect(isAppError(new AppError("x", 400, "y"))).toBe(true);
  });

  it("returns false for plain Error / unknown values", () => {
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError("string error")).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError({ code: "x", status: 400, message: "y" })).toBe(false); // duck-typing しない
  });
});

describe("toErrorPayload", () => {
  it("preserves AppError code/status/message in response body", () => {
    const err = new AppError("invalid_file", 400, "画像ファイルが必要です");
    expect(toErrorPayload(err)).toEqual({
      status: 400,
      body: { error: "画像ファイルが必要です", code: "invalid_file" },
    });
  });

  it("falls through to 500 for non-AppError values", () => {
    expect(toErrorPayload(new Error("boom"))).toEqual({
      status: 500,
      body: { error: "Internal server error", code: "internal_error" },
    });
    expect(toErrorPayload("string")).toEqual({
      status: 500,
      body: { error: "Internal server error", code: "internal_error" },
    });
    expect(toErrorPayload(null)).toEqual({
      status: 500,
      body: { error: "Internal server error", code: "internal_error" },
    });
  });
});
