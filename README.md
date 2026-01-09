# GravTile - GNOME Window Tiling Extension

Intelligent window tiling for GNOME Shell with edge-snapping, auto-tiling, smart resizing, and window swapping.

## Features

- **Edge-Snapping**: Drag windows to screen edges for 50% left/right, corners for quarters, or top for maximize
- **Intelligent Resize**: When one window grows, neighbors shrink proportionally
- **Auto-Tiling**: New windows automatically fit into the layout
- **Window Swapping**: Drag a window over another to swap their positions
- **Ultrawide Support**: Optimized for 32:9 and 21:9 monitors with thirds layout support

## Requirements

- GNOME Shell 45, 46, or 47
- Fedora with Wayland (tested)

## Installation (Development)

```bash
# Install as symlink for development
./scripts/install.sh

# Enable the extension
gnome-extensions enable gravtile@colin.local

# For Wayland: Log out and log back in
# For X11: Alt+F2 → 'r' → Enter
```

## Development

```bash
# Watch logs in real-time
./scripts/logs.sh

# Reload extension after changes
./scripts/reload.sh

# Check extension status
gnome-extensions info gravtile@colin.local
```

## Debugging

```bash
# Open Looking Glass (GNOME's dev console)
# Press Alt+F2, type 'lg', press Enter

# In Looking Glass:
# > global.get_window_actors()
# > imports.ui.main.extensionManager.lookup('gravtile@colin.local')

# Check all logs (not just filtered)
journalctl -b -o cat /usr/bin/gnome-shell | grep -E "(error|gravtile)" -i
```

## Project Structure

```
gravtile@colin.local/
├── metadata.json               # Extension metadata (GNOME 45-47)
├── extension.js                # Entry point (enable/disable)
│
└── src/
    ├── constants.js            # Configuration values
    │
    ├── core/
    │   ├── TileManager.js      # Main orchestrator
    │   ├── LayoutEngine.js     # Snap position calculations
    │   └── StateStore.js       # Window state & neighbor relationships
    │
    ├── services/
    │   ├── WindowTracker.js    # Window lifecycle events
    │   ├── SnapDetector.js     # Edge detection during drag
    │   ├── ResizeHandler.js    # Intelligent neighbor resizing
    │   └── SwapDetector.js     # Window position swapping
    │
    ├── ui/
    │   └── SnapOverlay.js      # Visual snap preview
    │
    └── utils/
        ├── Logger.js           # Debug logging
        ├── GnomeCompat.js      # GNOME API abstraction
        └── Geometry.js         # Rectangle calculations
```

## How It Works

### Edge Snapping
1. User starts dragging a window
2. `SnapDetector` polls cursor position
3. When cursor enters a snap zone (edge/corner), `SnapOverlay` shows preview
4. On drag release, `TileManager` moves window to calculated position

### Intelligent Resize
1. User resizes a tiled window
2. `ResizeHandler` detects the resize operation
3. `StateStore` provides neighbor information
4. Neighbors shrink/grow proportionally (respecting min sizes)

### Auto-Tiling
1. New window opens
2. `TileManager` calculates equal distribution
3. All existing windows resize, new window takes its slot

### Window Swapping
1. User drags a tiled window over another
2. `SwapDetector` detects when center enters another window
3. Both windows swap positions

## Configuration

Currently hardcoded in `src/constants.js`:
- `INNER_GAP`: 8px (gap between windows)
- `OUTER_GAP`: 8px (gap to screen edges)
- `SNAP_THRESHOLD`: 50px (trigger zone size)

GSettings UI planned for Phase 6.

## License

MIT
