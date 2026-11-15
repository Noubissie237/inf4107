import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Avatar } from "@/components/Avatar";

describe("Avatar", () => {
  it("shows the initials when there is no photo", () => {
    render(<Avatar name="Estelle Diallo" />);
    expect(screen.getByText("ED")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows the initials when the source is null", () => {
    render(<Avatar name="Awa Ndiaye" src={null} />);
    expect(screen.getByText("AN")).toBeInTheDocument();
  });

  it("shows the image when there is a source", () => {
    render(<Avatar name="Estelle Diallo" src="blob:photo" size={128} />);
    const image = document.querySelector("img");
    expect(image).toHaveAttribute("src", "blob:photo");
    expect(image).toHaveStyle({ width: "128px", height: "128px" });
    expect(screen.queryByText("ED")).not.toBeInTheDocument();
  });

  it("reports an image that cannot be loaded", () => {
    const onError = vi.fn();
    render(<Avatar name="Estelle Diallo" src="https://signed.example/photo" onError={onError} />);
    fireEvent.error(document.querySelector("img")!);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
