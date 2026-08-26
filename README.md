# PlayLens

**PlayLens – Play Store Downloads, Reviews & Update Dates**

Chrome extension: hiện **lượt tải ⬇ · rating★ + số review · ngày update ⟳** cho mọi app trong các trang list của Google Play (trang developer, collection/cluster, search, home) — khỏi phải mở từng app.

Ba chế độ hiển thị (bật/tắt độc lập bằng feature flags trong popup):

1. **Badge overlay** — dải thông tin đè lên đáy icon từng app (không chiếm chỗ, không vỡ layout).
1b. **Inline dưới rating** — dòng thông tin nhỏ (`⬇100M+ · 824.1K rv` + `⟳ ngày update` tô màu) chèn ngay dưới dòng rating có sẵn của card.
2. **Side panel** — panel cố định bên phải, hiển thị dạng **bảng**: mỗi hàng là một app với các cột App (icon + tên) · ⬇ downloads · ★ rating · Rv số review · Updated (ngày `d/M/yy`, tô màu theo độ tươi). **Click header cột để sort** (click lần nữa để đảo chiều, có chỉ báo ▲/▼); click hàng để mở trang app. Nút **CSV** copy cả danh sách vào clipboard. Mở/đóng bằng nút 📊 nổi ở mép phải; trạng thái mở được nhớ lại.

## Cài đặt

1. Mở `chrome://extensions`, bật **Developer mode**
2. **Load unpacked** → chọn thư mục `play-list-info/`
3. Mở trang Play bất kỳ. Bấm icon extension trên toolbar để chỉnh flags.

## Đóng gói

```bash
./build.sh
```

Tạo `dist/playlens-v<version>.zip` (version đọc từ `manifest.json`, chỉ gồm 5 file runtime, không dính `.DS_Store`) — dùng để upload Chrome Web Store hoặc chia sẻ. CI cũng tự chạy build này khi merge `develop` → `uat` (xem `.github/workflows/build.yml`).

## Nhánh & CI

- `main` — bản phát hành (landing page ở `docs/` publish qua GitHub Pages)
- `develop` — phát triển hằng ngày
- `uat` — merge từ `develop` để test; mỗi lần push/merge vào `uat`, GitHub Actions tự chạy `build.sh` và đính kèm zip vào artifact của run.

## Feature flags (popup)

| Flag | Mặc định | Ý nghĩa |
|---|---|---|
| `overlay` | bật | Badge đè trên icon |
| `inline` | bật | Dòng thông tin dưới rating có sẵn trong card |
| `panel` | bật | Panel danh sách bên phải (kèm nút 📊) |
| `panelOpen` | tắt | Panel tự mở sẵn khi vào trang |

Flags lưu ở `chrome.storage.sync`, áp dụng **ngay lập tức** (content script lắng nghe `storage.onChanged`, không cần reload trang).

Ngoài popup nhanh, có **trang Settings đầy đủ** (`options.html`): chuột phải icon extension → *Options*, hoặc bấm "⚙ Mở trang cài đặt đầy đủ" trong popup — toggle từng flag kèm mô tả chi tiết + nút **Xóa cache dữ liệu app**.

## Cách hoạt động

- Content script quét mọi anchor `details?id=...` có ảnh (app card). Mỗi app: fetch trang chi tiết với `hl=en&gl=US` (label ổn định để parse), lấy:
  - **Tên app + rating + review count** — parse JSON-LD (`SoftwareApplication`): tên chuẩn và số review **chính xác** (vd 53,623 → `53.6K rv`)
  - **Downloads** — regex quanh label `Downloads` (vd `1M+`)
  - **Updated on** — ngày update, tô màu theo độ tươi: xanh ≤ 6 tháng, cam ≤ 18 tháng, đỏ cũ hơn
- Badge chờ icon lazy-load xong mới gắn (tránh badge trôi nổi khi ảnh chưa có kích thước); bo góc theo đúng border-radius của icon.
- Cache 12h trong `chrome.storage.local`, fetch tối đa 3 app song song. Play là SPA → MutationObserver tự quét khi scroll/điều hướng; đổi trang thì reset danh sách panel.
- Play áp CSP **Trusted Types** (chặn `innerHTML` cả với content script) → toàn bộ UI build bằng `createElement`/`textContent`.

## Giới hạn

- Parse dựa vào cấu trúc HTML của Play (JSON-LD + label `Downloads` / `Updated on`). Google đổi markup thì cập nhật regex trong `content.js` (`fetchAppInfo`).
- App không có rating (quá mới) → chỉ hiện downloads + ngày update.
