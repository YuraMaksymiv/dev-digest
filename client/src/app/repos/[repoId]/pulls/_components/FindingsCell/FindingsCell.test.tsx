import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFindingPreview } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const PREVIEW: PrFindingPreview[] = [
  {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 12,
    confidence: 0.98,
    rationale: "A live key is committed in source.",
  },
  {
    severity: "WARNING",
    category: "bug",
    title: "Retry-After header omitted on 429",
    file: "src/middleware/ratelimit.ts",
    start_line: 52,
    confidence: 0.81,
    rationale: "The 429 branch sets only the status code.",
  },
];

describe("FindingsCell", () => {
  it("renders a dash when the PR has never been reviewed", () => {
    renderWithIntl(<FindingsCell findings={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a dash when the latest review found nothing", () => {
    renderWithIntl(<FindingsCell findings={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows only non-zero severities, highest first", () => {
    const { container } = renderWithIntl(
      <FindingsCell findings={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 1 }} />,
    );
    expect(container.textContent).toBe("21");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("opens a read-only preview on hover, headed by the run's finding count", () => {
    const { container } = renderWithIntl(
      <FindingsCell findings={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }} preview={PREVIEW} />,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Focusable and named, so the preview is reachable without a pointer.
    expect(screen.getByLabelText("2 findings in this run")).toBeInTheDocument();

    fireEvent.mouseEnter(container.firstElementChild!);
    const pop = screen.getByRole("tooltip");
    expect(pop).toHaveTextContent("2 FINDINGS IN THIS RUN");
    expect(pop).toHaveTextContent("Hardcoded Stripe secret key");
    expect(pop).toHaveTextContent("src/config.ts:12");
    expect(pop).toHaveTextContent("98% conf");
    expect(pop).toHaveTextContent("A live key is committed in source.");
    // Read-only: the list never mutates findings.
    expect(pop.querySelectorAll("button")).toHaveLength(0);
  });

  it("counts the findings the preview omits", () => {
    const { container } = renderWithIntl(
      <FindingsCell findings={{ CRITICAL: 3, WARNING: 4, SUGGESTION: 0 }} preview={PREVIEW} />,
    );
    fireEvent.mouseEnter(container.firstElementChild!);
    const pop = screen.getByRole("tooltip");
    expect(pop).toHaveTextContent("7 FINDINGS IN THIS RUN");
    expect(pop).toHaveTextContent("+5 more");
  });

  it("closes the preview when the pointer leaves", () => {
    const { container } = renderWithIntl(
      <FindingsCell findings={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }} preview={PREVIEW} />,
    );
    const cell = container.firstElementChild!;
    fireEvent.mouseEnter(cell);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(cell);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
