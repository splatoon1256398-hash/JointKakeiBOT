import { describe, it, expect } from "vitest";
import {
  ChatRequestSchema,
  DateStringSchema,
  StorageScanRequestSchema,
  StoragePathSchema,
  parseBody,
} from "./schemas";
import { isAppError } from "@/lib/errors";

describe("DateStringSchema", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(DateStringSchema.safeParse("2026-04-17").success).toBe(true);
  });
  it.each(["2026/04/17", "2026-4-17", "17-04-2026", "2026-04-17T00:00:00Z", ""])(
    "rejects malformed input: %s",
    (value) => {
      expect(DateStringSchema.safeParse(value).success).toBe(false);
    }
  );
});

describe("StoragePathSchema", () => {
  it("accepts a safe path", () => {
    expect(StoragePathSchema.safeParse("user/2026/04/photo.jpg").success).toBe(true);
  });
  it("rejects traversal / empty segments", () => {
    expect(StoragePathSchema.safeParse("user/../etc/passwd").success).toBe(false);
    expect(StoragePathSchema.safeParse("user//photo.jpg").success).toBe(false);
    expect(StoragePathSchema.safeParse("user/./photo.jpg").success).toBe(false);
  });
});

describe("ChatRequestSchema", () => {
  const validBase = {
    message: "コーヒー 500 円",
    selectedUser: "れん",
    history: [],
    lastRecordedId: null,
  };

  it("accepts a minimal valid body", () => {
    expect(ChatRequestSchema.safeParse(validBase).success).toBe(true);
  });

  it("accepts history items with functionCalls", () => {
    const body = {
      ...validBase,
      history: [
        {
          role: "assistant" as const,
          content: "記録しました",
          functionCalls: [
            {
              name: "record_expense",
              args: { amount: 500, store: "スタバ" },
              result: { success: true, message: "ok" },
            },
          ],
        },
      ],
    };
    expect(ChatRequestSchema.safeParse(body).success).toBe(true);
  });

  it("rejects empty message", () => {
    expect(ChatRequestSchema.safeParse({ ...validBase, message: "" }).success).toBe(false);
  });

  it("rejects messages over 4000 chars", () => {
    const msg = "a".repeat(4001);
    expect(ChatRequestSchema.safeParse({ ...validBase, message: msg }).success).toBe(false);
  });

  it("rejects invalid role", () => {
    const body = {
      ...validBase,
      history: [{ role: "system", content: "nope" }],
    };
    expect(ChatRequestSchema.safeParse(body).success).toBe(false);
  });

  it("rejects non-UUID lastRecordedId", () => {
    expect(
      ChatRequestSchema.safeParse({ ...validBase, lastRecordedId: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("accepts null lastRecordedId", () => {
    expect(
      ChatRequestSchema.safeParse({ ...validBase, lastRecordedId: null }).success
    ).toBe(true);
  });
});

describe("StorageScanRequestSchema", () => {
  it("accepts storagePath with optional mimeType", () => {
    expect(
      StorageScanRequestSchema.safeParse({ storagePath: "user/x.jpg", mimeType: "image/jpeg" })
        .success
    ).toBe(true);
  });
  it("accepts storagePath alone", () => {
    expect(StorageScanRequestSchema.safeParse({ storagePath: "user/x.jpg" }).success).toBe(true);
  });
  it("rejects missing storagePath", () => {
    expect(StorageScanRequestSchema.safeParse({}).success).toBe(false);
  });
  it("rejects unsafe storagePath", () => {
    expect(
      StorageScanRequestSchema.safeParse({ storagePath: "user/../secret.jpg" }).success
    ).toBe(false);
  });
});

describe("parseBody", () => {
  it("returns parsed data on success", () => {
    const parsed = parseBody(ChatRequestSchema, {
      message: "x",
      selectedUser: "れん",
      history: [],
      lastRecordedId: null,
    });
    expect(parsed.message).toBe("x");
  });

  it("throws AppError(invalid_request, 400) with a descriptive message on failure", () => {
    try {
      parseBody(ChatRequestSchema, { message: "", selectedUser: "れん", history: [] });
      throw new Error("expected throw");
    } catch (err) {
      if (!isAppError(err)) throw err;
      expect(err.code).toBe("invalid_request");
      expect(err.status).toBe(400);
      expect(err.message).toContain("message");
    }
  });

  it("throws when body is null (malformed JSON case)", () => {
    try {
      parseBody(ChatRequestSchema, null);
      throw new Error("expected throw");
    } catch (err) {
      if (!isAppError(err)) throw err;
      expect(err.code).toBe("invalid_request");
    }
  });
});
