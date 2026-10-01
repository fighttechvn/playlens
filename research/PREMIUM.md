# PlayLens Pro — đề xuất gói trả phí

> Ngày: 1/10/2026 · Áp dụng cho: v2.1.0 · Người đọc: chủ dự án.
> Nguồn đối thủ: trang Chrome Web Store và landing của từng sản phẩm (xem bảng 2); mô hình giá tham chiếu từ <https://www.insightsocial.app/> (Free / Pro $9.99 tháng / gói credit mua lẻ). Số liệu người dùng và giá có thể đã đổi — kiểm tra lại trước khi chốt giá công khai.

## 1. Kết luận

1. **Giữ nguyên 24 tính năng của v2.0.0 miễn phí.** Bản 2.0.0 đã công khai trên GitHub với đủ 24 tính năng; rút lại gần như chắc chắn gây phản ứng xấu và mất lợi thế "mã nguồn mở, miễn phí, không tài khoản" so với AppstoreSpy (khoá số cài đặt chính xác sau thuê bao).
2. **Bán những thứ tốn công theo thời gian, không bán dữ liệu đang công khai**: theo dõi thứ hạng từ khoá tự động hằng ngày, cảnh báo, so sánh nhiều app có biểu đồ, báo cáo/ sao lưu lịch sử, danh sách từ khoá + chấm điểm hàng loạt. Đây là các thứ người làm ASO trả tiền ở AppstoreSpy/Appark/AppTweak, và là những thứ chạy nền hoặc cần tích luỹ — free chỉ có bản "nếm thử".
3. **Thanh toán qua Polar** (Merchant of Record: lo thuế VAT/GST, hoàn tiền, hoá đơn; trả tiền về tài khoản ngân hàng qua Stripe Connect, Việt Nam được hỗ trợ). Khoá bản quyền do Polar tự phát hành khi có đơn và tự thu hồi khi huỷ thuê bao. Extension chỉ gọi 1 endpoint công khai (không cần bí mật nào trong mã).
4. Không cần máy chủ riêng, không cần đăng nhập. Mô hình tin cậy: **khoá bản quyền dán vào trang cài đặt**, kiểm tra lại mỗi ngày, ngoại tuyến 14 ngày vẫn dùng.

## 2. Đối thủ và chỗ đứng

| Sản phẩm | Giá | Free có gì | Trả phí có gì |
|---|---|---|---|
| AppstoreSpy (extension) | thuê bao | tuổi app, thể loại, cài đặt dạng bucket | cài đặt chính xác, cài đặt/ngày, bộ sưu tập, Keyword Finder, AppTimeline |
| Appark | miễn phí kéo về SaaS | từ khoá top 10, theo dõi thứ hạng (giới hạn), lịch sử version, tải review | gói SaaS đầy đủ |
| AsoSpy | miễn phí | cài đặt, ngày phát hành/cập nhật | — |
| InsightSocial (Instagram, cùng mô hình) | Free / Pro $9,99 tháng / credit | xuất giới hạn dòng/tháng, lịch sử 30 ngày | hạn mức cao, AI, lịch sử 3 năm, ưu tiên hỗ trợ |

Bài học từ InsightSocial: landing đi theo trục *hero → bảng demo → tính năng → cách dùng → bảng giá Free/Pro → FAQ → CTA*; giới hạn đặt ở **khối lượng và độ sâu lịch sử**, không đặt ở "có/không có tính năng cơ bản".

## 3. Phân chia Free / Pro

| Tính năng | Free | Pro |
|---|---|---|
| 24 tính năng của 2.0.0 (cài đặt chính xác, tuổi app, watchlist, review, keyword ideas, CSV…) | ✅ đầy đủ | ✅ |
| **Rank Tracker tự động** — chọn từ khoá + quốc gia cho app trong Watchlist, service worker kiểm tra mỗi ngày, vẽ lịch sử vị trí, hiện app lên/xuống hạng | 3 cặp (từ khoá, quốc gia) | 150 cặp, 90 ngày lịch sử |
| **Cảnh báo** (thông báo desktop): lên/xuống hạng ≥ N bậc, version mới, rating tụt, đổi giá | — | ✅ (xin quyền `notifications` tuỳ chọn khi bật) |
| **So sánh app** — chọn app trong bảng, bảng so cạnh nhau + biểu đồ chồng lịch sử cài đặt/rating | 2 app, không biểu đồ | tối đa 6 app + biểu đồ lịch sử |
| **Báo cáo Watchlist** — 1 file HTML/Markdown: thay đổi 7/30 ngày, cài đặt/ngày, thứ hạng lên xuống | — | ✅ |
| **Sao lưu / xuất toàn bộ lịch sử** (JSON + CSV mọi snapshot, nhập lại được) | — | ✅ |
| **Danh sách từ khoá** — lưu bộ từ khoá, chấm điểm hàng loạt ("Score all"), 1 chạm đưa vào Rank Tracker | chấm 10 từ đầu (như 2.0.0) | không giới hạn, lưu 20 danh sách |
| **Điểm cơ hội theo quốc gia** — một từ khoá chấm ở 5 nước cạnh nhau | — | ✅ |

Nguyên tắc gắn khoá: tính năng Pro *hiện ra* nhưng mờ kèm nút "Pro", bấm vào mở khung nâng cấp — không giấu, không popup làm phiền, không đếm ngược giả.

## 4. Giá đề xuất (chốt trong Polar, không nằm trong mã)

| Gói | Giá | Ghi chú |
|---|---|---|
| Monthly | **$4,99 / tháng** | rẻ hơn rõ rệt so với mốc $9,99 của InsightSocial; công cụ ASO cho dev indie |
| Yearly | **$39 / năm** (≈ $3,25/tháng, −35%) | gói nên được đẩy |
| Lifetime | **$89 một lần** | hợp người dùng extension; Polar phát khoá không hết hạn |

Polar thu phí nền tảng ~4% + 40¢ mỗi giao dịch (kèm phí thanh toán/thuế phát sinh) — kiểm tra bảng phí hiện hành khi tạo tài khoản. Cấu hình đề xuất cho sản phẩm: **giới hạn kích hoạt 3 thiết bị**, khoá có tiền tố `PLAY-`.

## 5. Kiến trúc kỹ thuật

```
Mua  →  buy.polar.sh (Polar)  →  email khoá bản quyền
Dán khoá → trang Cài đặt → POST api.polar.sh/v1/customer-portal/license-keys/validate (+ /activate nếu có giới hạn thiết bị)
          ↓ lưu {key, activationId, status, expiresAt, validatedAt} vào storage.local
Mỗi ngày: service worker validate lại (alarm). 404 = thu hồi → khoá Pro. Mất mạng → giữ nguyên tới 14 ngày.
content.js / background.js chỉ đọc bản ghi đã lưu → PLSI.license.isPro(rec).
```

- Các endpoint license của Polar không cần xác thực và cho phép CORS `*` (đã kiểm tra preflight từ origin `chrome-extension://` và `play.google.com`) → **không thêm host permission**, không có cảnh báo cài đặt mới.
- Quyền `notifications` khai trong `optional_permissions`: chỉ hỏi khi người dùng bật Cảnh báo, người dùng free không thấy gì thêm.
- Dữ liệu gửi đi: **chỉ khoá bản quyền + nhãn thiết bị tự đặt + organization id** gửi tới api.polar.sh. Privacy policy và store listing phải ghi rõ (đã cập nhật trong nhánh này).
- **Thật lòng về bảo mật:** mã nguồn mở (MIT) nên ai muốn vẫn sửa cờ để mở Pro được. Mô hình này dựa vào sự tiện lợi + ủng hộ tác giả, không phải DRM. Muốn chặn thật phải có máy chủ — chưa đáng ở giai đoạn này.

## 6. Việc chủ dự án phải làm (Claude không tạo tài khoản/đăng nhập thay được)

1. Tạo organization trên <https://polar.sh> → hoàn tất onboarding thanh toán (Stripe Connect Express).
2. Tạo 3 sản phẩm (Monthly/Yearly/Lifetime) với benefit **License Keys** (tiền tố `PLAY-`, giới hạn kích hoạt 3, tự thu hồi khi huỷ).
3. Tạo 3 Checkout Link → gửi lại cho Claude: `organization_id` (UUID, Settings → Organization) và 3 URL `https://buy.polar.sh/...`. Điền vào `license.js` (khối `CONFIG`) và `docs/index.html` (đối tượng `CHECKOUT`).
4. Thử mua bằng **Sandbox** (đặt `CONFIG.API` về `https://sandbox-api.polar.sh`) trước khi mở bán thật.
5. Cập nhật mô tả Chrome Web Store: mục "Single purpose"/"Payments" và justification cho `notifications` (text sẵn trong `store/listing.md`).
