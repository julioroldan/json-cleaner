# Change Log

All notable changes to the "json-cleaner" extension will be documented in this file.

## [1.0.0] - 2025-11-03

### Added
- 🎉 Initial release of JSON Cleaner
- ✅ Interactive tree view for JSON structure visualization
- 👁️ Live preview panel with real-time updates
- 📋 Copy filtered JSON to clipboard
- 📄 Create new file with filtered content
- 🔄 Auto-refresh on JSON file changes (500ms debounce)
- 💾 State preservation across file switches
- 🎯 Smart filtering features:
  - Checkbox selection for properties
  - Support for nested objects
  - Support for arrays of objects
  - Support for arrays of primitives (direct selection)
  - Automatic removal of empty objects from arrays
- 🎨 Toggle preview button in editor toolbar and tree view
- 🌐 Multi-document support with state caching

### Features
- Tree view displays JSON structure with expandable nodes
- Primitive arrays show values directly (no numeric indexes)
- Arrays of objects show numeric indexes for each element
- Preview panel updates automatically when selections change
- State is preserved when switching between JSON files
- Invalid JSON doesn't break the tree (shows previous valid state)

### Technical
- TypeScript implementation with strict compilation
- Singleton pattern for tree data provider
- Deep cloning for state preservation
- UUID-based node identification
- Bootstrap 5 for preview panel UI
- Highlight.js for syntax highlighting