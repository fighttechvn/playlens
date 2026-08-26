#!/usr/bin/env bash
# Đóng gói extension thành zip để upload Chrome Web Store / chia sẻ.
# Cách dùng:  ./build.sh
# Kết quả:    dist/playlens-v<version>.zip (+ dist/playlens.zip tên cố định)

set -euo pipefail
cd "$(dirname "$0")"

# Các file thực sự cần cho extension chạy (không kèm README, dist, script này)
FILES=(
  manifest.json
  content.js
  styles.css
  popup.html
  popup.js
  options.html
  options.js
)

# Lấy version từ manifest.json
VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json)
if [[ -z "$VERSION" ]]; then
  echo "Không đọc được version từ manifest.json" >&2
  exit 1
fi

# Kiểm tra đủ file trước khi gói
for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "Thiếu file: $f" >&2
    exit 1
  fi
done

OUT_DIR=dist
OUT="$OUT_DIR/playlens-v$VERSION.zip"
STABLE="$OUT_DIR/playlens.zip" # tên cố định cho link download "latest"
mkdir -p "$OUT_DIR"
rm -f "$OUT"

# -X: bỏ extra attributes của macOS (không dính __MACOSX / .DS_Store)
zip -X "$OUT" "${FILES[@]}"
cp "$OUT" "$STABLE"

echo ""
echo "Đã đóng gói: $OUT ($(du -h "$OUT" | cut -f1 | tr -d ' '))"
unzip -l "$OUT"
