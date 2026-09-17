import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);

describe("FindingsCell", () => {
  it("renders a dash when the PR has never been reviewed", () => {
    render(<FindingsCell findings={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a dash when the latest review found nothing", () => {
    render(<FindingsCell findings={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows only non-zero severities, highest first", () => {
    const { container } = render(
      <FindingsCell findings={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 1 }} />,
    );
    expect(container.textContent).toBe("21");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
