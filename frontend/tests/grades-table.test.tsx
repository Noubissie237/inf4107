import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GradesTable } from "@/components/GradesTable";
import type { CourseGrades } from "@/lib/api";

const COMPLETE: CourseGrades = {
  code: "INF4101",
  title: "Génie logiciel avancé",
  credits: 4,
  cc: 14.5,
  tp: 12,
  sn: 10,
  average: 11.45,
};
const MISSING_TP: CourseGrades = {
  code: "INF4108",
  title: "Architecture logicielle",
  credits: 3,
  cc: 9.25,
  tp: null,
  sn: 12,
  average: null,
};

function row(code: string) {
  return screen.getByRole("row", { name: new RegExp(code) });
}

describe("GradesTable", () => {
  it("has the expected columns and a caption naming the semester", () => {
    render(<GradesTable courses={[COMPLETE]} semester="S1" />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Code", "Matière", "Crédits", "CC", "TP", "SN", "Moyenne"]);
    expect(screen.getByRole("table", { name: "Notes du semestre S1" })).toBeInTheDocument();
  });

  it("shows code, title, credits and the grades in the French format", () => {
    render(<GradesTable courses={[COMPLETE]} semester="S1" />);
    const cells = within(row("INF4101"))
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual(["Génie logiciel avancé", "4", "14,50", "12,00", "10,00", "11,45"]);
    expect(within(row("INF4101")).getByRole("rowheader")).toHaveTextContent("INF4101");
  });

  it("shows a dash with an accessible label for a missing grade and average", () => {
    render(<GradesTable courses={[MISSING_TP]} semester="S1" />);
    const line = within(row("INF4108"));
    expect(line.getAllByText("Note absente")).toHaveLength(2); // TP and average
    expect(line.getAllByText("—")).toHaveLength(2);
    expect(line.getByText("9,25")).toBeInTheDocument();
    expect(line.getByText("12,00")).toBeInTheDocument();
  });

  it("aligns the numbers to the right and keeps text columns to the left", () => {
    render(<GradesTable courses={[COMPLETE]} semester="S1" />);
    const cells = within(row("INF4101")).getAllByRole("cell");
    expect(cells[0]).not.toHaveClass("text-right"); // title
    for (const cell of cells.slice(1)) {
      expect(cell).toHaveClass("text-right", "tabular-nums");
    }
    expect(screen.getByRole("columnheader", { name: "Moyenne" })).toHaveClass("text-right");
  });

  it("scrolls horizontally on small screens instead of breaking the layout", () => {
    render(<GradesTable courses={[COMPLETE]} semester="S1" />);
    const table = screen.getByRole("table");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
    // "relative" keeps the sr-only (absolute) labels inside the scroll area: without it they
    // widen the whole page on a phone
    expect(table.parentElement).toHaveClass("relative");
    expect(table).toHaveClass("min-w-[640px]");
  });

  it("lists all the courses it is given, in order", () => {
    render(<GradesTable courses={[COMPLETE, MISSING_TP]} semester="S1" />);
    const codes = screen.getAllByRole("rowheader").map((h) => h.textContent);
    expect(codes).toEqual(["INF4101", "INF4108"]);
  });
});
