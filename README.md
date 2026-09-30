# Docs Viewer

A DSH (DeepSeek Harness) plugin that provides a documentation viewer for workspace files.

## Features

- Browse and view Markdown (`.md`) and HTML (`.html`) files from workspace directories
- Configurable documentation directory path (default: `docs/`)
- Markdown rendering with syntax highlighting
- Mermaid diagram support with automatic dark/light theme adaptation
- Floating tooltip showing documentation statistics
- Responsive sidebar UI with theme-aware styling

## Installation

```bash
# Install via DSH plugin manager
plugin_manager install_bundle --target /path/to/docs-viewer
```

## Usage

1. Click the "Docs" button in the sidebar footer to open the documentation viewer
2. Select a workspace and file type (MD/HTML) from the left panel
3. Click on any file to view its contents
4. Configure the documentation directory path by clicking the "Edit" button next to "📁 Docs Directory"

## Configuration

The plugin stores its configuration in `config.json`:

```json
{
  "docsDir": "docs"
}
```

You can change the `docsDir` value through the UI or by editing this file directly.

## Development

The plugin consists of two main files:

- `index.js` - Host-side plugin with API routes for file operations
- `client.js` - Client-side UI with React components

### API Routes

- `GET /docs-viewer/config` - Get current configuration
- `POST /docs-viewer/config` - Update configuration
- `GET /docs-viewer/workspaces` - List available workspaces
- `GET /docs-viewer/list` - List files in a workspace
- `GET /docs-viewer/read` - Read file content
- `GET /docs-viewer/stats` - Get documentation statistics

## License

MIT
