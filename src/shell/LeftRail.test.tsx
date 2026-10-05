// LeftRail: one link per lens path (LENS_PATHS), labelled from LENS_LABELS. The @ts-expect-error
// lines are checked by tsc -b: a lens path without a label, or a label for a non-lens path, must not
// compile.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LeftRail, LENS_LABELS } from "./LeftRail";
import { LENS_PATHS } from "../routes/paths";

describe("LeftRail", () => {
  it("renders a link for every lens path, in LENS_PATHS order, with its label", () => {
    render(<MemoryRouter initialEntries={["/elsewhere"]}><LeftRail /></MemoryRouter>);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([...LENS_PATHS]);
    expect(links.map((a) => a.textContent)).toEqual(LENS_PATHS.map((p) => LENS_LABELS[p]));
    expect(links.every((a) => a.className === "")).toBe(true);
  });

  it("types the labels by lens path", () => {
    // @ts-expect-error every lens path needs a label
    const missing: typeof LENS_LABELS = {};
    // @ts-expect-error only lens paths take a label
    const extra: typeof LENS_LABELS = { "/pivot": "Pivot", "/nope": "Nope" };
    expect([missing, extra]).toHaveLength(2);
  });
});
