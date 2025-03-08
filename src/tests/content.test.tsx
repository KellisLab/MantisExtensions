import PlasmoFloatingButton from "../content";
import React from "react";
import { render } from "@testing-library/react";

test("Content renders without crashing", (): void => {
    const { container } = render(<PlasmoFloatingButton />);
    expect(container).toBeTruthy();
});