# Route Engine Development Guide

Development guide for the Route Engine visual novel engine. Prioritizes conciseness, simplicity, and precision.

## Quick Start

```bash
bun install
```

## Architecture

Route Engine uses functional programming patterns with immutable state management:

- **Store-Based State**: Two stores (`projectDataStore` for game data, `systemStore` for runtime state)
- **Sequential Processing**: Pipeline transformations `constructPresentationState` → `constructRenderState`
- **Event-Driven Flow**: User Input → Preset Events → System Actions → State Updates → Render
- **Schema-Driven**: YAML schemas define all data contracts with runtime validation

## Project Structure

```
src/
├── RouteEngine.js              # Main engine orchestrator and entry point
├── index.js                    # Library exports and public API
├── schemas/                    # YAML validation schemas
│   ├── system.yaml             # Runtime state validation schema
│   ├── system.yaml      # System action definitions and validation
│   └── projectData/            # Game data schemas (scenes, lines, presets, etc.)
│       ├── scene.yaml          # Scene structure and validation
│       ├── line.yaml           # Dialogue line and content validation
│       ├── presentation.yaml   # Visual presentation type definitions
│       ├── presets.yaml        # Event handling preset configurations
│       └── [story.yaml, section.yaml, resources.yaml]
├── stores/                     # Functional state management
│   ├── index.js                # Store factory functions and initialization
│   ├── projectData.store.js    # Pure selector functions for game data
│   ├── system.store.js         # Runtime state actions and mutations
│   ├── constructPresentationState.js  # Transform data into presentation layer
│   └── constructRenderState.js        # Transform presentation into render state
└── util.js                     # Pure utility functions and helpers

spec/                           # Unit tests (Vitest framework)
├── RouteEngine.spec.yaml       # Main engine integration tests
├── util.spec.js                # Utility function tests
├── vnData.spec.yaml            # Game data validation tests
└── data/testVnData.yaml        # Test data fixtures

vt/                            # Visual tests (Rettangoli framework)
├── specs/[dialogue, background, character, etc.]  # Visual test specifications
├── static/public/              # Test assets (images, audio)
└── templates/default.html      # Test rendering template

docs/                          # Technical documentation
```
