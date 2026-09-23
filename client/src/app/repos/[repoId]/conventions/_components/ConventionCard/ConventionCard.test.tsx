import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "async",
  rule: "Always use async/await instead of .then() chains",
  rationale: "Flag a .then() chain added to an async function.",
  evidence_path: "src/api/users.ts",
  evidence_line: 23,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
  created_at: "2026-09-21T10:00:00.000Z",
};

function setup(over: Partial<ConventionCandidate> = {}) {
  const handlers = {
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
  };
  renderWithIntl(<ConventionCard candidate={{ ...CANDIDATE, ...over }} {...handlers} />);
  return handlers;
}

describe("ConventionCard", () => {
  it("shows the rule with the evidence that proves it", () => {
    setup();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23")).toBeInTheDocument();
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeInTheDocument();
  });

  it("omits the line number when the gate could not pin one", () => {
    setup({ evidence_line: null });
    expect(screen.getByText("src/api/users.ts")).toBeInTheDocument();
  });

  it("names its actions for a screen reader, not just with an icon", () => {
    setup();
    expect(
      screen.getByRole("button", { name: `Accept convention: ${CANDIDATE.rule}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Delete convention: ${CANDIDATE.rule}` }),
    ).toBeInTheDocument();
  });

  it("reports accept and reject to the page", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: `Accept convention: ${CANDIDATE.rule}` }));
    expect(h.onAccept).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: `Reject convention: ${CANDIDATE.rule}` }));
    expect(h.onReject).toHaveBeenCalledOnce();
  });

  it("edits the rule and saves the trimmed text", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: `Edit convention: ${CANDIDATE.rule}` }));
    const box = screen.getAllByRole("textbox")[0]!;
    fireEvent.change(box, { target: { value: "  Use async/await, never .then()  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.onSave).toHaveBeenCalledWith({
      rule: "Use async/await, never .then()",
      rationale: CANDIDATE.rationale,
    });
  });

  it("falls back to the original rule rather than saving an empty one", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: `Edit convention: ${CANDIDATE.rule}` }));
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.onSave).toHaveBeenCalledWith({
      rule: CANDIDATE.rule,
      rationale: CANDIDATE.rationale,
    });
  });

  it("discards an edit on cancel", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: `Edit convention: ${CANDIDATE.rule}` }));
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "something else" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.onSave).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("labels an already-accepted candidate as accepted", () => {
    setup({ status: "accepted" });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });
});

describe("ConventionCard — in-flight guards", () => {
  function setupBusy(over: Partial<ConventionCandidate> = {}) {
    const handlers = {
      onAccept: vi.fn(),
      onReject: vi.fn(),
      onSave: vi.fn(),
      onDelete: vi.fn(),
    };
    renderWithIntl(
      <ConventionCard candidate={{ ...CANDIDATE, ...over }} {...handlers} busy />,
    );
    return handlers;
  }

  it("ignores delete while another write for this card is still in flight", () => {
    const h = setupBusy();
    fireEvent.click(screen.getByRole("button", { name: `Delete convention: ${CANDIDATE.rule}` }));
    expect(h.onDelete).not.toHaveBeenCalled();
  });

  it("ignores edit while a write is in flight, so the form cannot open over stale data", () => {
    setupBusy();
    fireEvent.click(screen.getByRole("button", { name: `Edit convention: ${CANDIDATE.rule}` }));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
