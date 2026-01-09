#!/bin/bash
# Reload the extension (disable + enable)

EXTENSION_UUID="gravtile@colin.local"

echo "Reloading $EXTENSION_UUID..."

gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null
sleep 0.5
gnome-extensions enable "$EXTENSION_UUID"

echo "Extension reloaded. Check logs with: ./scripts/logs.sh"
echo ""
echo "Note: For major changes, you may need to log out and back in (Wayland)"
