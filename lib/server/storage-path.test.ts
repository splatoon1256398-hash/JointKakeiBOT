import { describe, it, expect } from "vitest";
import { assertSafeUserScopedPath } from "./storage-path";
import { AppError, isAppError } from "@/lib/errors";

const USER_ID = "abc123";

function expectAppError(
  fn: () => void,
  expected: { code: string; status: number }
) {
  try {
    fn();
    throw new Error("expected AppError but function returned");
  } catch (err) {
    if (!isAppError(err)) throw err;
    expect(err.code).toBe(expected.code);
    expect(err.status).toBe(expected.status);
  }
}

describe("assertSafeUserScopedPath", () => {
  it("accepts a well-formed user-scoped path", () => {
    expect(() =>
      assertSafeUserScopedPath(`${USER_ID}/receipts/2026/04/photo.jpg`, USER_ID)
    ).not.toThrow();
  });

  it("rejects non-string inputs", () => {
    expectAppError(() => assertSafeUserScopedPath(undefined, USER_ID), {
      code: "invalid_storage_path",
      status: 400,
    });
    expectAppError(() => assertSafeUserScopedPath(null, USER_ID), {
      code: "invalid_storage_path",
      status: 400,
    });
    expectAppError(() => assertSafeUserScopedPath(42, USER_ID), {
      code: "invalid_storage_path",
      status: 400,
    });
  });

  it("rejects empty strings", () => {
    expectAppError(() => assertSafeUserScopedPath("", USER_ID), {
      code: "invalid_storage_path",
      status: 400,
    });
  });

  it("rejects paths that don't start with the caller's userId", () => {
    expectAppError(() => assertSafeUserScopedPath("otheruser/photo.jpg", USER_ID), {
      code: "forbidden",
      status: 403,
    });
  });

  it("rejects path traversal via '..'", () => {
    expectAppError(() => assertSafeUserScopedPath(`${USER_ID}/../other/x.jpg`, USER_ID), {
      code: "invalid_storage_path",
      status: 400,
    });
  });

  it("rejects single-dot segments", () => {
    expectAppError(() => assertSafeUserScopedPath(`${USER_ID}/./x.jpg`, USER_ID), {
      code: "invalid_storage_path",
      status: 400,
    });
  });

  it("rejects empty segments from double slashes", () => {
    expectAppError(() => assertSafeUserScopedPath(`${USER_ID}//x.jpg`, USER_ID), {
      code: "invalid_storage_path",
      status: 400,
    });
  });

  it("rejects unsafe characters in segments", () => {
    expectAppError(() => assertSafeUserScopedPath(`${USER_ID}/bad name.jpg`, USER_ID), {
      code: "invalid_storage_path",
      status: 400,
    });
    expectAppError(() => assertSafeUserScopedPath(`${USER_ID}/bad;drop.jpg`, USER_ID), {
      code: "invalid_storage_path",
      status: 400,
    });
  });

  it("rejects overly long paths", () => {
    const longPath = `${USER_ID}/` + "a".repeat(600);
    expectAppError(() => assertSafeUserScopedPath(longPath, USER_ID), {
      code: "invalid_storage_path",
      status: 400,
    });
  });

  it("narrows the type after successful assertion (compile-time)", () => {
    const input: unknown = `${USER_ID}/photo.jpg`;
    assertSafeUserScopedPath(input, USER_ID);
    // assertSafeUserScopedPath の戻りで input は string として扱える
    const upper: string = input.toUpperCase();
    expect(upper).toBe(`${USER_ID.toUpperCase()}/PHOTO.JPG`);
  });

  it("returns the same AppError type that route handlers expect", () => {
    try {
      assertSafeUserScopedPath("foo", USER_ID);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
    }
  });
});
