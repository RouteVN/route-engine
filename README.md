# RVN - Route Visual Novel Engine

A JavaScript engine for creating interactive visual novels with state management, presentation layers, and event handling.

## Overview

RVN is a flexible visual novel engine that separates game logic from presentation, allowing developers to create rich interactive stories with complex state management and dynamic rendering.

## Features

- **State Management**: Separate stores for project data, system state, presentation state, and render state
- **Event-Driven Architecture**: Handle user interactions through a robust event system
- **Flexible Presentation**: Dynamic presentation state construction from declarative actions
- **Schema-Based Project Data**: YAML-based project structure with validation
- **Testing Framework**: Comprehensive test suite with @rettangoli/vt

## Architecture

The engine uses a layered architecture with distinct responsibilities:

- **Project Data (PD)**: The complete content of the visual novel
- **System State (SS)**: Current game state including variables, save data, and pointers
- **Presentation Actions (PA)**: Imperative actions that modify presentation state
- **Presentation State (PS)**: Intermediate representation without system state applied
- **Render State (RS)**: Final computed state representing what appears on screen

## Installation

```bash
npm install
```

## Usage

### Basic Setup

```javascript
import RouteEngine from './src/RouteEngine.js';

const engine = new RouteEngine();

// Set up event handler
engine.onEvent((event) => {
  const { eventType, payload } = event;
  
  if (eventType === 'render') {
    // Handle render updates
    console.log('Render state:', payload);
  }
});

// Initialize with project data
engine.init({
  projectData: {
    // Your visual novel data following the schema
    sections: { /* ... */ },
    resources: { /* ... */ },
    // ... other project data
  }
});

// Handle user interactions
engine.handleEvent({
  eventType: 'LeftClick',
  payload: {}
});
```

### Event Types

#### Events from Engine (onEvent)
- `render`: When the engine updates the visual state
- `save`: When save data should be persisted

#### Events to Engine (handleEvent)
- `LeftClick`: User left-clicks the screen
- `ClickRightScreen`: User right-clicks the screen
- `ScrollUpScreen`: User scrolls up
- `KeyboardSpace`: Space key pressed
- `KeyboardEnter`: Enter key pressed
- `KeyboardEsc`: Escape key pressed
- `SaveDataUpdate`: Update save data

## Development

### Scripts

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build the engine
npm run build

# Run tests with coverage
npm run coverage

# Generate VT files
npm run vt:generate
```

### Project Structure

```
src/
├── RouteEngine.js          # Main engine class
├── index.js                # Entry point
├── schemas/                # YAML schemas for project data
│   ├── projectData/        # Individual data schemas
│   ├── system.yaml         # System state schema
│   └── systemActions.yaml  # System actions schema
├── stores/                 # State management stores
│   ├── constructPresentationState.js
│   ├── constructRenderState.js
│   ├── projectData.store.js
│   └── system.store.js
├── test/                   # Test data and specs
└── util.js                 # Utility functions

spec/                       # Test specifications
vt/                         # Visual testing files
docs/                       # Documentation
```

### Testing

The project uses Vitest for testing with YAML-based test specifications:

```bash
# Run all tests
npm test


