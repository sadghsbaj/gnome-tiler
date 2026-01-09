#!/bin/bash
# Install the extension for development (symlink)

EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions"
EXTENSION_UUID="gravtile@colin.local"
SOURCE_DIR="$(dirname "$0")/../$EXTENSION_UUID"

# Create extensions directory if it doesn't exist
mkdir -p "$EXTENSION_DIR"

# Remove existing installation
if [ -L "$EXTENSION_DIR/$EXTENSION_UUID" ]; then
    rm "$EXTENSION_DIR/$EXTENSION_UUID"
    echo "Removed existing symlink"
elif [ -d "$EXTENSION_DIR/$EXTENSION_UUID" ]; then
    rm -rf "$EXTENSION_DIR/$EXTENSION_UUID"
    echo "Removed existing directory"
fi

# Create symlink
ln -s "$(realpath "$SOURCE_DIR")" "$EXTENSION_DIR/$EXTENSION_UUID"
echo "Created symlink: $EXTENSION_DIR/$EXTENSION_UUID -> $(realpath "$SOURCE_DIR")"

# Suggest next steps
echo ""
echo "Extension installed. Next steps:"
echo "  1. Enable the extension:"
echo "     gnome-extensions enable $EXTENSION_UUID"
echo ""
echo "  2. For Wayland: Log out and log back in"
echo "     For X11: Press Alt+F2, type 'r', press Enter"
echo ""
echo "  3. Check logs:"
echo "     ./scripts/logs.sh"
