#!/bin/bash
# Show extension logs in real-time

echo "Showing GravTile logs (Ctrl+C to stop)..."
echo "================================================"
echo ""

# Follow journalctl and filter for our extension
journalctl -f -o cat /usr/bin/gnome-shell 2>&1 | grep -i --line-buffered "gravtile\|GravTile"
