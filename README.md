# Route Engine

A Visual Novels built in JavaScript

## Overview

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

