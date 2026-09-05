import { describe, expect, it } from "vitest";

import { visibleRapportMessages } from "@/lib/rapport-message/permissions";
import {
  parseRapportMessage,
  parseRapportMessageStore,
  validateRapportMessageDraft,
} from "@/lib/rapport-message/store";
import { splitBodyParagraphs, sanitizeRapportMessageFilenamePart } from "@/lib/rapport-message/format";
import type { RapportMessage } from "@/lib/rapport-message/types";
import type { AuthUser } from "@/integrations/auth/types";

const admin: AuthUser = { id: "admin-1", email: "admin@example.com", role: "admin" };
const userA: AuthUser = { id: "user-a", email: "a@example.com", role: "user" };
const userB: AuthUser = { id: "user-b", email: "b@example.com", role: "user" };

function doc(partial: Partial<RapportMessage> & Pick<RapportMessage, "id" | "createdByUserId">): RapportMessage {
  return {
    title: "Objet",
    date: "2026-08-23",
    recipient: "Commandement",
    sender: "Brigade",
    reference: "",
    body: "Texte",
    signature: "Le chef",
    createdByEmail: null,
    createdByName: "auteur",
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    ...partial,
  };
}

describe("rapport-message store parsing", () => {
  it("ignores malformed entries and duplicates", () => {
    const parsed = parseRapportMessageStore({
      documents: [
        { id: "one", title: "A", date: "2026-01-01", recipient: "R", sender: "S", body: "B" },
        { id: "one", title: "duplicate" },
        { title: "no-id" },
        "bad",
        null,
      ],
    });
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0]?.id).toBe("one");
    expect(parsed.documents[0]?.title).toBe("A");
  });

  it("returns empty store for invalid payloads", () => {
    expect(parseRapportMessageStore(null).documents).toEqual([]);
    expect(parseRapportMessageStore("x").documents).toEqual([]);
    expect(parseRapportMessage(undefined)).toBeNull();
  });

  it("allows empty title, date, recipient, sender and body", () => {
    expect(
      validateRapportMessageDraft({
        title: "Objet",
        date: "2026-08-23",
        recipient: "Dest",
        sender: "Exp",
        reference: "",
        body: "Paragraphe",
        signature: "",
      }),
    ).toBeNull();
    expect(
      validateRapportMessageDraft({
        title: " ",
        date: "2026-08-23",
        recipient: "Dest",
        sender: "Exp",
        reference: "",
        body: "Paragraphe",
        signature: "",
      }),
    ).toBeNull();
    expect(
      validateRapportMessageDraft({
        title: "",
        date: "not-a-date",
        recipient: "",
        sender: "",
        reference: "",
        body: "",
        signature: "",
      }),
    ).toBe("date");
  });
});

describe("rapport-message visibility", () => {
  const own = doc({ id: "a", createdByUserId: "user-a" });
  const other = doc({ id: "b", createdByUserId: "user-b" });

  it("lets admins see every document", () => {
    expect(visibleRapportMessages([own, other], admin).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("lets a user see only their own documents", () => {
    expect(visibleRapportMessages([own, other], userA).map((item) => item.id)).toEqual(["a"]);
    expect(visibleRapportMessages([own, other], userB).map((item) => item.id)).toEqual(["b"]);
  });
});

describe("rapport-message format helpers", () => {
  it("splits paragraphs on blank lines and single line breaks", () => {
    expect(splitBodyParagraphs("A\n\nB\nC")).toEqual(["A", "B", "C"]);
  });

  it("sanitizes export filename parts", () => {
    expect(sanitizeRapportMessageFilenamePart("Rapport: urgence / n°1")).toBe("Rapport-urgence-n1");
  });
});
