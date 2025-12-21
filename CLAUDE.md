# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome Manifest V3 extension called "Workflow Recorder" that captures and records user workflows on SaaS business applications. It records user interactions (clicks, inputs, form submissions, navigation) and page states, storing them in IndexedDB for later export and analysis.

## Architecture

### Core Components

**Background Service Worker** (`background/service-worker.js`)
- Orchestrates the entire recording lifecycle
- Manages recording state (start, stop, cancel)
- Coordinates communication between popup and content scripts
- Handles workflow persistence via `WorkflowDBManager`
- Main class: `WorkflowRecorder`

**Database Manager** (`background/db-manager.js`)
- IndexedDB wrapper for persistent storage
- Three main tables: `workflows`, `etats` (states), `actions`
- Main class: `WorkflowDBManager`
- Provides CRUD operations and statistics

**Content Scripts** (injected into web pages):
- `content-scripts/recorder.js` - Event capture (clicks, inputs, form submissions, navigation)
  - Main class: `EventRecorder`
  - Captures user actions with debouncing and intelligent filtering
  - Generates multiple selector strategies (ID, CSS, XPath)
- `content-scripts/page-analyzer.js` - Page state analysis
  - Main class: `PageAnalyzer`
  - Converts page content to Markdown using Turndown
  - Extracts interactive elements, forms, breadcrumbs, navigation
  - Anonymizes sensitive data (emails, phone numbers, credit cards)

**Popup UI** (`popup/popup.js`, `popup/popup.html`)
- Three modes: idle, recording, review
- List mode for viewing/managing saved workflows
- Main class: `WorkflowPopup`

**Export System** (`export/export-manager.js`, `export/rag-formatter.js`)
- Multi-format export: JSON, CSV, HTML (PDF-ready), Selenium Python scripts
- `WorkflowExportManager` coordinates exports

### Data Flow

1. User clicks "Start Recording" in popup
2. Service worker broadcasts `RECORDING_STARTED` to all content scripts
3. Content scripts attach event listeners and capture initial page state
4. User interactions trigger `ACTION_CAPTURED` messages to service worker
5. Page changes trigger `STATE_CAPTURED` messages
6. Service worker enriches data with IDs, timestamps, sequence numbers
7. User clicks "Stop Recording" → review mode in popup
8. User saves workflow → data persisted to IndexedDB
9. Export generates files in various formats

### Message Passing

The extension uses Chrome's message passing API extensively:

**From Popup to Service Worker:**
- `GET_RECORDING_STATE` - Check current recording status
- `START_RECORDING` - Begin recording
- `STOP_RECORDING` - End recording
- `CANCEL_RECORDING` - Cancel without saving
- `SAVE_WORKFLOW` - Persist to IndexedDB
- `GET_WORKFLOWS` - Retrieve all workflows
- `DELETE_WORKFLOW` - Remove workflow

**From Service Worker to Content Scripts:**
- `RECORDING_STARTED` - Enable event capture
- `RECORDING_STOPPED` - Disable event capture
- `RECORDING_CANCELLED` - Cancel recording

**From Content Scripts to Service Worker:**
- `ACTION_CAPTURED` - User interaction event
- `STATE_CAPTURED` - Page state snapshot

### Database Schema

**workflows** table:
- `id` (primary key)
- `title`, `description`, `tags`
- `metadata` (createdAt, duration, actionCount, stateCount, startUrl, endUrl)
- `status`

**etats** (states) table:
- `id`, `workflowId`
- `url`, `urlPattern`, `title`
- `markdownContent` - Full page converted to Markdown
- `interactiveElements` - Array of clickable/interactive elements
- `forms` - Form structures
- `pageContext` - Breadcrumb, navigation, viewport
- `contentHash` - For deduplication
- `timestamp`, `sequenceNumber`

**actions** table:
- `id`, `workflowId`
- `type` - 'click', 'input', 'change', 'submit', 'navigation'
- `target` - Element details (tagName, selectors, attributes)
- `timestamp`, `sequenceNumber`
- Action-specific details (inputDetails, clickDetails, etc.)

## Development Commands

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select this directory
4. The extension icon should appear in the toolbar

### Testing

Open test pages in `test-page.html` and `test-page-complex.html` to verify:
- Event capture (clicks, inputs, form submissions)
- Page state analysis
- Workflow recording and saving
- Export functionality

### Debugging

**Service Worker Console:**
- Go to `chrome://extensions/`
- Click "service worker" link under the extension
- Console shows recording lifecycle, action/state capture

**Content Script Console:**
- Open DevTools on any web page
- Console shows event capture, page analysis
- Look for emoji prefixes: 🎬, 🖱️, ⌨️, 📊, 📋

**Popup Console:**
- Right-click extension icon → "Inspect popup"
- Console shows popup lifecycle, mode switches

**IndexedDB Inspection:**
- Open DevTools → Application tab → IndexedDB → "WorkflowRecorderDB"
- Inspect workflows, etats, actions tables

## Key Implementation Details

### Selector Generation Strategy

The extension generates multiple selectors for each element (priority order):
1. ID selector (`#elementId`)
2. Data attributes (`data-*`)
3. CSS class selector (up to 3 classes)
4. XPath (positional)
5. CSS path (nth-child)
6. Text content (fallback)

This ensures robustness when replaying workflows even if page structure changes.

### Debouncing and Filtering

**Input Events:** Debounced by 1 second - only captured after user stops typing
**Click Events:** 100ms debounce to prevent double-clicks
**State Capture:** Content hash comparison prevents duplicate state captures

### Data Anonymization

The `PageAnalyzer` anonymizes:
- Email addresses → `user@example.com`
- Phone numbers → `+33 1 23 45 67 89`
- URLs → `https://example.com`
- Credit card numbers → `1234 5678 9012 3456`

Input values are NOT stored - only metadata (type, length, label).

### URL Pattern Extraction

URLs are normalized to patterns:
- `/clients/123/dossier` → `/clients/{id}/dossier`
- `/items/a1b2c3d4-uuid` → `/items/{uuid}`

This allows grouping workflows by page template rather than specific instances.

## Common Tasks

### Adding a New Export Format

1. Create a new formatter class in `export/export-manager.js`:
   ```javascript
   class MyFormatter {
       async format(workflowData, options) {
           return {
               filename: `workflow-${workflowData.workflow.id}.ext`,
               content: '...',
               mimeType: 'application/...'
           };
       }
   }
   ```

2. Register in `WorkflowExportManager` constructor:
   ```javascript
   this.formatters = {
       // ...existing formatters
       myformat: new MyFormatter()
   };
   ```

3. Add button to export modal in `popup/popup.html`

### Adding a New Action Type

1. Add handler in `content-scripts/recorder.js`:
   ```javascript
   handleMyAction(event) {
       const actionData = {
           type: 'my_action',
           target: {...},
           // action-specific details
       };
       this.sendToServiceWorker('ACTION_CAPTURED', actionData);
   }
   ```

2. Add logging in `service-worker.js` `logAction()` method

3. Update `getActionDescription()` in `popup/popup.js` for display

### Modifying Page Analysis

Edit `content-scripts/page-analyzer.js`:
- `analyzeCurrentPage()` - Main entry point
- `findInteractiveElements()` - Element discovery
- `convertToMarkdown()` - Content extraction
- `extractPageContext()` - Context metadata

## File Structure

```
background/
  service-worker.js       # Main orchestrator
  db-manager.js           # IndexedDB wrapper

content-scripts/
  recorder.js             # Event capture
  page-analyzer.js        # Page state analysis

popup/
  popup.html              # UI layout
  popup.js                # UI logic
  popup.css               # Styles (not shown)

export/
  export-manager.js       # Multi-format export
  rag-formatter.js        # RAG documentation

libs/
  utils.js                # Shared utilities
  turndown.min.js         # HTML to Markdown

manifest.json             # Chrome extension config
icons/                    # Extension icons
test-page.html            # Simple test page
test-page-complex.html    # Complex test page
```

## Important Notes

- This is a Manifest V3 extension - use service workers, not background pages
- Content scripts cannot directly access IndexedDB - all persistence goes through service worker
- The extension uses `importScripts()` in service worker to load `db-manager.js`
- All messaging is async - always use `sendResponse()` and return `true` from listeners
- Turndown library converts HTML to Markdown - loaded as content script
- Extension requires `activeTab`, `storage`, `scripting` permissions and `<all_urls>` host permissions
