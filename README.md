# Mantis Connection Browser Extension

A browser extension that connects third-party applications with Mantis, enabling seamless integration of web content into Mantis spaces.

## Overview

Mantis Connection is a browser extension built with Plasmo Framework that allows users to create and manage Mantis spaces directly from supported web pages. It provides a floating action button that appears on compatible websites and enables content extraction and space creation. It is styled with TailwindCSS

## Installation

1. Clone the repository:
```bash
git clone https://github.com/KellisLab/MantisExtensions.git
cd mantis-connection
```

2. Install dependencies:
```bash
yarn install
```

3. Development mode:
```bash
yarn run dev
```

4. Build for production:
```bash
yarn run build
```

5. Package the extension:
```bash
yarn run package
```

6. Download and run the the backend  [here](https://github.com/KellisLab/MantisExtensionsBackend.git)

## Project Structure

```
mantis-connection/
├── src/
│   ├── connections/           # Connection implementations
│   │   ├── google/           # Google search connection
│   │   ├── wikipedia/        # Wikipedia connection
│   │   └── types.ts         # Connection type definitions
│   ├── background.ts        # Extension background script
│   ├── content.tsx         # Content script with UI components
│   ├── driver.ts          # Core connection functionality
│   ├── persistent.ts      # Storage management
│   ├── popup.tsx         # Extension popup UI
│   └── style.css        # Global styles
├── plasmo.config.ts    # Plasmo framework configuration
└── package.json
└── .env                # Configuration file for global use
└── .env.development (not pre-existing) # You have to create this file to use it. It overrides .env and is not tracked
```

## Core Concepts

### Connections

Connections are implementations that define how to interact with specific websites. Each connection must implement the `MantisConnection` interface:

```typescript
interface MantisConnection {
    name: string;
    description: string;
    icon: string;
    trigger: (url: string) => boolean;
    createSpace: (injectUI: injectUIType, setProgress: setProgressType) => Promise<{
        spaceId: string;
        createdWidget: HTMLElement;
    }>;
    injectUI: (space_id: string) => Promise<HTMLElement>;
}
```

### Storage

The extension uses Chrome's storage API to persist spaces. Spaces are stored with the following structure:

```typescript
interface StoredSpace {
    name: string;
    id: string;
    dateCreated: string;
    url: string;
    host: string;
    connectionParent: string;
}
```

### UI Components

The extension provides several UI components:
- Floating Action Button (FAB)
- Connection Dialog
- Progress Indicators
- Space Management Interface

## Adding New Connections

To add a new connection:

1. Create a new directory under `src/connections/`
2. Implement the `MantisConnection` interface
3. Define the trigger conditions
4. Implement space creation logic
5. Implement UI injection
6. Export the connection

Example:

```typescript
// src/connections/example/connection.tsx
import type { MantisConnection } from "../types";

export const ExampleConnection: MantisConnection = {
    name: "Example",
    description: "Example connection description",
    icon: exampleIcon,
    trigger: (url) => url.includes("example.com"),
    createSpace: async (injectUI, setProgress) => {
        // Implementation
    },
    injectUI: async (space_id) => {
        // Implementation
    }
};
```

## Configuration

The extension can be configured through `.env` or `.env.development`:

* `PLASMO_PUBLIC_FRONTEND`: controls where the extension will embed the spaces to
* `PLASMO_PUBLIC_COOKIE_DOMAIN`: will be the domain of frontend, that cookies are registered to. e.g. if `PLASMO_PUBLIC_FRONTEND` was `https://mantisdev.csail.mit.edu`, then `PLASMO_PUBLIC_COOKIE_DOMAIN` will be `mit.edu`.
* `PLASMO_PUBLIC_SDK`: The domain to use as the extension backend for managing/creating spaces

Ensure that the `PLASMO_PUBLIC_FRONTEND` and `PLASMO_PUBLIC_COOKIE_DOMAIN` here point to the same domain that is being used in the Extension Backend. This is because this extension sends the cookie to the backend, from the `PLASMO_PUBLIC_COOKIE_DOMAIN`. This cookie won't work if the backend uses a different domain as the frontend.

If you want to use a local frontend and cookie_domain, then create a `.env.development` file and set the variables in there, this won't be tracked by git.

## Development Workflow

1. Make changes to the code
2. Run `yarn run dev` for development
3. Load the extension from `build/chrome-mv3-dev/`
4. Test changes on supported websites
5. Build and package for production

## API Reference

### Storage API

```typescript
// Get all cached spaces
getCachedSpaces(): Promise<StoredSpace[]>

// Add a space to cache
addSpaceToCache(space: StoredSpace): Promise<void>

// Delete a space from cache
deleteSpace(space: StoredSpace): Promise<void>

// Delete spaces matching a condition
deleteSpacesWhere(predicate: (space: StoredSpace) => boolean): Promise<void>
```

### Connection API

```typescript
// Search for active connections
searchConnections(url: string): MantisConnection[]

// Create a new space
createSpace(injectUI: injectUIType, setProgress: setProgressType): Promise<{
    spaceId: string;
    createdWidget: HTMLElement;
}>

// Inject UI for existing space
injectUI(space_id: string): Promise<HTMLElement>
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request