import { render } from "@testing-library/react";
import type { MantisConnection } from "../connections/types";
import { CONNECTIONS } from "../driver";
import { expect, test } from '@jest/globals';

test ("Tests are working", () => {
    expect (true).toBeTruthy();
});

test ("`CONNECTIONS` is an array of Connections", () => {
    expect (CONNECTIONS).toBeInstanceOf(Array);
    expect (CONNECTIONS.length).toBeGreaterThan(0);
    
    const requiredProps = ['name', 'description', 'icon', 'trigger', 'createSpace', 'injectUI'];

    CONNECTIONS.forEach(connection => {
        requiredProps.forEach(prop => {
            expect(connection).toHaveProperty(prop);
        });
    });
});