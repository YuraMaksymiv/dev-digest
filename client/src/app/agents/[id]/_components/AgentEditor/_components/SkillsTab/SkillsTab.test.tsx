import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillDetail, SkillSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const setSkills = vi.fn();

const ALL: SkillSummary[] = [
  {
    id: "s1",
    name: "pr-quality-rubric",
    description: "When scoring a PR, walk these dimensions.",
    type: "rubric",
    source: "manual",
    body: "…",
    enabled: true,
    version: 1,
    evidence_files: null,
    used_by: 1,
  },
  {
    id: "s2",
    name: "secret-leakage-gate",
    description: "When the diff adds a credential, say what to rotate.",
    type: "security",
    source: "manual",
    body: "…",
    enabled: true,
    version: 1,
    evidence_files: null,
    used_by: 1,
  },
  {
    id: "s3",
    name: "no-then-chains",
    description: "When the diff adds a .then() chain, require async/await.",
    type: "convention",
    source: "manual",
    body: "…",
    enabled: false, // muted globally
    version: 1,
    evidence_files: null,
    used_by: 0,
  },
];

const LINKED: AgentSkillDetail[] = [
  { ...ALL[0]!, order: 0, link_enabled: true },
  { ...ALL[1]!, order: 1, link_enabled: false },
];

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: ALL, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: LINKED, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: setSkills, isPending: false }),
}));

vi.mock("../../../../../../../lib/toast", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => setSkills.mockClear());
afterEach(cleanup);

describe("SkillsTab", () => {
  it("renders every workspace skill as a row, linked ones first in order", () => {
    renderTab();
    const names = screen.getAllByText(/pr-quality-rubric|secret-leakage-gate|no-then-chains/);
    expect(names.map((n) => n.textContent)).toEqual([
      "pr-quality-rubric",
      "secret-leakage-gate",
      "no-then-chains",
    ]);
  });

  it("counts only the skills that actually reach the prompt", () => {
    renderTab();
    // 1 of 3: s1 is on, s2 is off for this agent, s3 is muted globally.
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
  });

  it("sends the whole ordered set with one flag flipped when a checkbox is clicked", () => {
    renderTab();
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!); // secret-leakage-gate → on

    expect(setSkills).toHaveBeenCalledTimes(1);
    expect(setSkills.mock.calls[0]![0]).toEqual({
      agentId: "ag1",
      skills: [
        { skill_id: "s1", enabled: true },
        { skill_id: "s2", enabled: true },
        { skill_id: "s3", enabled: false },
      ],
    });
  });

  it("reorders with the arrow buttons and persists the new order", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Move secret-leakage-gate up" }));

    expect(setSkills).toHaveBeenCalledTimes(1);
    expect(setSkills.mock.calls[0]![0].skills).toEqual([
      { skill_id: "s2", enabled: false },
      { skill_id: "s1", enabled: true },
      { skill_id: "s3", enabled: false },
    ]);
  });

  it("cannot enable a globally disabled skill from here", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[2]!); // no-then-chains
    expect(setSkills).not.toHaveBeenCalled();
    expect(screen.getByText("disabled globally")).toBeInTheDocument();
  });

  it("hides the reorder controls while the filter narrows the list", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Move pr-quality-rubric up" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), {
      target: { value: "secret" },
    });

    expect(screen.queryByRole("button", { name: /^Move /})).not.toBeInTheDocument();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();
  });
});
