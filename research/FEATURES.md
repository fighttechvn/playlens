# PlayLens — nghiên cứu tính năng mới

> Ngày nghiên cứu: 28/9/2026 · Phiên bản đang phát hành: **1.6.1** · Người đọc: chủ dự án.
> Mọi đường dẫn dữ liệu và endpoint dưới đây đều đã chạy thử thật (xem [Cách kiểm chứng](#9-cách-kiểm-chứng-lại)); phần nào chỉ là suy đoán có ghi rõ.

## 1. Kết luận nhanh

1. **Trang chi tiết mà PlayLens đang tải sẵn chứa nhiều dữ liệu hơn hẳn phần đang dùng.** Hiện chỉ lấy 6 trường (tên, icon, downloads dạng "10M+", rating, reviews, ngày cập nhật). Cùng trang đó còn có **số cài đặt chính xác**, **ngày phát hành**, **phân bố 1–5 sao**, giá IAP, có quảng cáo hay không, thể loại, version, Android tối thiểu, email và website nhà phát triển.
2. Nghĩa là nhóm tính năng giá trị nhất **không tốn thêm request nào, không cần thêm permission nào** — chỉ là đổi parser và thêm cột.
3. Đối thủ chính (AppstoreSpy) **thu phí thuê bao** cho "số cài đặt chính xác" và "cài đặt/ngày". PlayLens có thể phát miễn phí đúng những thứ đó, vì dữ liệu nằm công khai trong trang.
4. Đề xuất phát hành theo 3 đợt: **v1.7** (dữ liệu có sẵn), **v1.8** (theo dõi theo thời gian + thứ hạng + quốc gia), **v2.0** (review, từ khoá, điểm cơ hội).

## 2. PlayLens hiện có gì

| Nhóm | Hiện trạng |
|---|---|
| Dữ liệu | downloads ("10M+"), rating, số review chính xác, ngày cập nhật |
| Hiển thị | badge trên icon · dòng inline dưới rating · bảng bên (sort, CSV, tab *This page* / *Recent*) |
| Tô màu | độ mới của bản cập nhật: ≤180 ngày xanh, ≤540 ngày vàng, còn lại đỏ |
| Lưu trữ | cache 12 giờ mỗi app (`app:<id>`), Recent tối đa 60 app, tất cả ở `chrome.storage.local` |
| Permission | `storage`, `clipboardWrite`, content script chỉ chạy trên `play.google.com` |
| Tải trang | tối đa 3 request song song, `hl=en&gl=US`, `credentials: 'omit'` |
| CSV | 6 cột: package, name, downloads, rating, reviews, updated |

## 3. Đối thủ

| Extension | Người dùng | Đánh giá | Cập nhật gần nhất | Mô hình | Tính năng chính |
|---|---|---|---|---|---|
| **AppstoreSpy for Play Store** | 10.000 | 3,9★ (36) | 3/9/2024 | Miễn phí + thuê bao | Tuổi app tô màu, thể loại, cài đặt, ngày phát hành/cập nhật. **Trả phí:** cài đặt chính xác, cài đặt/ngày, doanh thu ước tính, tổng app + tổng cài đặt của nhà phát triển, quốc gia đứng đầu, bộ sưu tập cá nhân, xem trước ảnh chụp |
| **Appark – Free ASO Tools** | 10.000+ | 4,8★ (80) | 17/11/2025 | Miễn phí (kéo về SaaS appark.ai) | Xu hướng tải, từ khoá đang xếp hạng, tải icon/video/ảnh, cào review theo vùng và ngôn ngữ, theo dõi thứ hạng, lịch sử thay đổi metadata |
| **AsoSpy** | 7.000 | 4,6★ (16) | 26/9/2026 | Miễn phí | Cài đặt, ngày phát hành, ngày cập nhật, thể loại, cài đặt/ngày ước tính |
| **Toolbox for Google Play Store** | 90.000 | 4,2★ (866) | 3/10/2024 | Miễn phí | Nút sang APKMirror/AppBrain, trạng thái beta, thanh cuộn ảnh chụp, đổi ngôn ngữ/vùng để so giá |
| **Google Play Reviews Exporter** | 363 | 1,0★ (1) | — | Có mua trong ứng dụng | Xuất review hàng loạt CSV/XLSX/JSON, lọc theo quốc gia/sao/ngày/từ khoá |

Chưa kiểm tra được: Ninja ASO, StoreMaven ASO Toolbox, AppTweak, "ASO Tools for Google Play Store" (trang trả về nội dung rỗng). Các trang thống kê chrome-stats.com chặn truy cập (403) nên không có số liệu tăng trưởng người dùng.

**Nhận xét**

- Hai extension lớn nhất về tính năng (AppstoreSpy, Toolbox) đều **không cập nhật từ năm 2024** — cơ hội cho một sản phẩm đang được bảo trì.
- AppstoreSpy bị chấm 3,9★: phần lớn dữ liệu hấp dẫn bị khoá sau thuê bao.
- Chỗ PlayLens đang hơn: mã nguồn mở, không máy chủ, không tài khoản, có bảng sort + CSV. Chỗ đang thua: ít trường dữ liệu, chưa có ngày phát hành, chưa có số liệu theo thời gian.
- Không đối thủ nào làm **so sánh giữa các quốc gia ngay trong bảng** hay **phân bố sao ngay trên thẻ**.

## 4. Nguồn dữ liệu đã kiểm chứng

### 4.1. Khối `ds:5` trong trang chi tiết (0 request thêm)

Trang `details?id=…&hl=en&gl=US` chứa các khối `AF_initDataCallback`. Khối có key `ds:5` giữ toàn bộ thông tin app ở `data[1][2]` (mảng 155 phần tử). Đã thử trên 5 app: `cc.forestapp`, `com.mojang.minecraftpe`, `com.whatsapp`, `com.supercell.clashofclans`, `vn.fighttech.go2048` — cấu trúc giống nhau ở cả 5.

| Trường | Đường dẫn (từ `data[1][2]`) | Ví dụ (Forest) | Ghi chú |
|---|---|---|---|
| **Cài đặt chính xác** | `[13][2]` | 49185779 | Toàn cầu, giống nhau ở mọi `gl` |
| Cài đặt tối thiểu | `[13][1]` | 10000000 | Số của nhãn "10M+" |
| Nhãn cài đặt | `[13][0]`, `[13][3]` | "10,000,000+", "10M+" | |
| **Ngày phát hành** | `[10][0]`, `[10][1][0]` | "Aug 25, 2014", 1408977873 | Timestamp tính bằng giây |
| Ngày cập nhật | `[145][0][0]`, `[145][0][1][0]` | | Timestamp ổn định hơn chuỗi ngày |
| Điểm | `[51][0][1]` | 4.315002 | **Theo quốc gia** |
| Số lượt chấm | `[51][2][1]` | 813462 | Theo quốc gia |
| Số review có chữ | `[51][3][1]` | 9995 | |
| **Phân bố sao** | `[51][1][1..5][1]` | 72101 · 31339 · 40473 · 93729 · 575764 | Thứ tự 1★ → 5★ |
| Giá | `[57][0][0][0][0][1][0]` | `[0,"USD",""]` | Minecraft: `[6990000,"USD","$6.99"]` (micro-đơn vị) |
| Khoảng giá IAP | `[19][0]` | "$0.99 - $59.99 per item" | Theo quốc gia (VN: "₫23,000 - ₫920,000") |
| Có quảng cáo | `[48]` | `["Contains ads"]` | `null` nếu không có |
| Thể loại | `[79][0][0][0]`, `[79][0][0][2]` | "Productivity", "PRODUCTIVITY" | Game: "GAME_STRATEGY" |
| Version | `[140][0][0][0]` | "5.28.0" | |
| Android tối thiểu | `[140][1][1][0][0][1]` | "10" | |
| Nhà phát triển | `[68][0]`, `[68][1][4][2]` | | URL có 2 dạng: `dev?id=<số>` và `developer?id=<tên>` |
| Email / website | `[69][1][0]`, `[69][0][5][2]` | | |
| Chính sách riêng tư | `[99][0][5][2]` | | |
| Xếp hạng nội dung | `[9][0]` | "Everyone" | |
| Có gì mới | `[144][1][1]` | | |
| Mô tả ngắn | `[73][0][1]` | | |
| Ảnh chụp | `[78][0]` | 8 ảnh | |

**Trường hợp biên đã gặp (parser phải chịu được):**

- App chưa có lượt chấm (`vn.fighttech.go2048`, 71 cài đặt): toàn bộ nhánh `[51]` rỗng → điểm, phân bố sao đều không có.
- App "Varies with device" (`com.whatsapp`): nhánh version và Android tối thiểu không tồn tại.
- App không có quảng cáo: `[48]` là `null`.

### 4.2. Endpoint `batchexecute` (mỗi lần gọi là 1 request thêm)

Gọi được từ content script vì cùng origin, không cần đăng nhập. `POST https://play.google.com/_/PlayStoreUi/data/batchexecute?rpcids=<id>&hl=en&gl=US`, body dạng form `f.req=…`, phản hồi có tiền tố `)]}'` cần cắt bỏ trước khi parse.

| Mục đích | rpcid | `f.req` |
|---|---|---|
| Gợi ý từ khoá | `IJ4APc` | `[[["IJ4APc","[[null,[\"focus ti\"],[10],[2],4]]",null,"generic"]]]` |
| Danh sách review | `oCPfdb` | `[[["oCPfdb","[null,[2,2,[5,null,null],null,[null,1]],[\"cc.forestapp\",7]]",null,"generic"]]]` |

Thử với "focus ti" trả về: focus timer, focus timer for study, focustown, focus time, focus time tracker. Review trả về id, tác giả, số sao, nội dung, thời điểm.

### 4.3. Các trang khác

| Trang | Kết quả thử | Dùng cho |
|---|---|---|
| `details?…&gl=VN` | Cài đặt giống hệt US; điểm 4,65 (US 4,32); giá IAP đổi sang ₫ | So sánh quốc gia |
| `apps/dev?id=…` | Supercell 7 app, FightTech VN 11 app, WhatsApp 2 app | Tổng hợp nhà phát triển |
| `apps/datasafety?id=…` | HTTP 200, có các mục "Data shared", "Data collected", "encrypted in transit" | Nhãn an toàn dữ liệu |
| Rail "Similar apps" trong trang chi tiết | 9 app lân cận | Đã dùng cho bảng |

## 5. Danh sách tính năng đề xuất

Cột *Request*: số request thêm cho mỗi app so với hiện tại. Cột *Công*: S ≤ nửa ngày, M ≈ 1–2 ngày, L ≥ 3 ngày.

### Đợt 1 — v1.7 "Số liệu đầy đủ" (không thêm request, không thêm permission)

| # | Tính năng | Mô tả | Request | Công |
|---|---|---|---|---|
| 1 | **Số cài đặt chính xác** | Hiện "49,2M" thay cho "10M+"; bảng sort theo số thật. Hai app cùng nhãn "10M+" có thể chênh nhau gần 5 lần | 0 | S |
| 2 | **Ngày phát hành + tuổi app** | Cột *Released*, nhãn tuổi ("3 tháng", "12 năm"); tô nổi app mới ≤30 ngày và ≤1 năm | 0 | S |
| 3 | **Cài đặt/ngày trung bình** | `cài đặt ÷ số ngày từ khi phát hành`. Forest: 49.185.779 ÷ 4.417 ngày ≈ 11.100/ngày. Ghi rõ là *trung bình cả đời*, không phải tốc độ hiện tại | 0 | S |
| 4 | **Phân bố sao** | Thanh 5 đoạn nhỏ trong bảng và tooltip; thêm chỉ số "% 1–2★" để lộ app có điểm cao nhưng nhiều người ghét | 0 | M |
| 5 | **Nhãn kiếm tiền** | Chip `Free/Paid $6.99`, `IAP $0.99–$59.99`, `Ads` | 0 | S |
| 6 | **Thể loại, version, Android tối thiểu** | Cột ẩn mặc định, bật trong phần chọn cột | 0 | S |
| 7 | **Tỉ lệ chấm điểm** | `lượt chấm ÷ cài đặt`. Forest 1,65%. Tỉ lệ thấp bất thường gợi ý cài đặt đến từ quảng cáo hoặc cài sẵn | 0 | S |
| 8 | **Chọn cột + lọc** | Bật/tắt cột; lọc theo cài đặt tối thiểu, tuổi app, có IAP, có quảng cáo | 0 | M |
| 9 | **Xuất dữ liệu đầy đủ** | CSV thêm toàn bộ trường mới; thêm nút tải tệp `.csv` và `.json` (tạo bằng Blob, không cần permission `downloads`) | 0 | S |
| 10 | **Liên hệ nhà phát triển** | Email, website trong hàng mở rộng của bảng, có nút sao chép | 0 | S |

### Đợt 2 — v1.8 "Theo dõi"

| # | Tính năng | Mô tả | Request | Công |
|---|---|---|---|---|
| 11 | **Số thứ hạng trên trang tìm kiếm** | Đánh số #1, #2… lên từng thẻ kết quả; lưu từ khoá + vị trí vào bảng và CSV. Thứ tự lấy từ DOM đang quét sẵn | 0 | S |
| 12 | **Danh sách theo dõi** | Nút ☆ trên hàng; tab *Watchlist* trong bảng; không bị giới hạn 60 như Recent | 0 | M |
| 13 | **Cài đặt/ngày đo thật** | Mỗi lần gặp lại một app sau ≥24 giờ, lưu `{ngày, cài đặt, lượt chấm, điểm}`. Khi có ≥2 mốc: tính tốc độ thật và vẽ sparkline. Đây là thứ đối thủ bán thuê bao | 0 | M |
| 14 | **Phát hiện thay đổi** | So với mốc trước: version mới, đổi tên, đổi giá, điểm tăng/giảm. Hiện chấm báo trong Watchlist | 0 | M |
| 15 | **So sánh quốc gia** | Chọn 2–5 quốc gia; bảng hiện điểm, lượt chấm, giá IAP từng nước cho app đang xem | +1 mỗi nước | M |
| 16 | **Tổng hợp nhà phát triển** | Trên trang nhà phát triển: số app, tổng cài đặt, app mới nhất, điểm trung bình — cộng từ các thẻ đã quét | 0 | S |
| 17 | **Làm mới nền cho Watchlist** | Tự cập nhật các app đang theo dõi mỗi ngày kể cả khi không mở Play. Cần service worker + `alarms` + host permission | cần thêm permission | L |

### Đợt 3 — v2.0 "Nghiên cứu sâu"

| # | Tính năng | Mô tả | Request | Công |
|---|---|---|---|---|
| 18 | **Xem nhanh review 1–3★** | Trên trang app: nút mở danh sách review xấu gần nhất, kèm từ xuất hiện nhiều | +1 mỗi 40 review | M |
| 19 | **Xuất review** | CSV/JSON, lọc theo sao và ngày. Đối thủ duy nhất có 363 người dùng, 1,0★ | +1 mỗi trang | M |
| 20 | **Gợi ý từ khoá** | Ô nhập trong bảng → danh sách gợi ý của Play, bấm để mở tìm kiếm; mở rộng theo bảng chữ cái (a–z) | +1 mỗi truy vấn | M |
| 21 | **Điểm cơ hội của từ khoá** | Trên trang tìm kiếm: tóm tắt top 10 — trung vị cài đặt, tuổi, % app cũ >18 tháng, % có IAP. Dùng lại công thức của `play-research` | 0 | M |
| 22 | **Xem trước trang cửa hàng** | Rê chuột vào hàng trong bảng → ảnh chụp + mô tả ngắn, không cần mở tab | 0 | M |
| 23 | **Nhãn an toàn dữ liệu** | App có chia sẻ dữ liệu với bên thứ ba hay không | +1 | S |
| 24 | **Liên kết nhanh** | Sang AppBrain, APKMirror, trang App Store tương ứng | 0 | S |

## 6. Thứ tự nên làm

| Ưu tiên | Tính năng | Lý do |
|---|---|---|
| 1 | #1, #2, #3, #5, #9 | Công nhỏ nhất, khác biệt lớn nhất; ngang ngay bản trả phí của AppstoreSpy về dữ liệu |
| 2 | #4, #7, #8 | Làm bảng thành công cụ phân tích thật, không chỉ là bảng số |
| 3 | #11, #12, #13 | Tạo lý do quay lại hằng ngày; dữ liệu lịch sử càng dùng lâu càng có giá trị, khó bị sao chép |
| 4 | #15, #16, #21 | Phục vụ đúng việc nghiên cứu thị trường đang làm ở `play-research` |
| 5 | #18–#20, #22–#24 | Hữu ích nhưng chạm giới hạn "một mục đích" của Chrome Web Store (xem mục 7) |
| Để sau | #17 | Đòi thêm permission → người dùng hiện tại bị hỏi lại quyền, tăng rủi ro duyệt |

## 7. Rủi ro và ràng buộc

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Google đổi vị trí trong `ds:5` | Cao — đường dẫn là chỉ số mảng, không có tên | Giữ parser hiện tại (JSON-LD + regex) làm dự phòng; mỗi trường đọc riêng trong `try`; kiểm tra kiểu và khoảng giá trị (ví dụ cài đặt chính xác phải ≥ cài đặt tối thiểu) trước khi hiển thị; không thì quay về "10M+" |
| Key khối đổi từ `ds:5` sang số khác | Trung bình | Không dựa vào tên key: duyệt mọi khối, chọn khối có `data[1][2]` dài >100 và `[13][2]` là số nguyên |
| Bị giới hạn tần suất khi tải nhiều | Trung bình | Giữ 3 request song song + cache 12 giờ; tính năng theo quốc gia và review chỉ chạy khi người dùng bấm |
| Đầy `storage.local` (10 MB) | Trung bình | Chỉ lưu mốc lịch sử cho app trong Watchlist; mỗi mốc ~40 byte; gộp mốc cũ hơn 90 ngày thành 1 mốc/tuần. 200 app × 1 năm ≈ 1 MB |
| Chính sách "một mục đích" của Chrome Web Store | Trung bình | Mục đích đang khai: *hiển thị thống kê công khai của app trên trang danh sách*. Đợt 1 và 2 nằm trong phạm vi. Xuất review và gợi ý từ khoá là mở rộng → cập nhật mô tả mục đích trước khi gửi duyệt |
| Trusted Types trên play.google.com | Đã biết | Thanh phân bố sao và sparkline dựng bằng `createElement` / `createElementNS` cho SVG, không dùng `innerHTML` |
| Quy tắc thương hiệu và chống nhồi từ khoá | Đã biết | Giữ tên dạng "for Google Play"; mô tả mới không lặp một từ khoá quá 5 lần |
| "Cài đặt/ngày trung bình" bị hiểu sai | Thấp | Ghi nhãn "avg/day since launch"; chỉ gọi là tốc độ hiện tại khi đã có mốc đo thật |
| Doanh thu ước tính | — | **Không làm.** Không có dữ liệu công khai nào cho phép tính; con số của đối thủ là mô hình phỏng đoán |
| Email nhà phát triển | Thấp | Là dữ liệu công khai trên trang, chỉ hiện khi người dùng mở hàng; không gom hàng loạt vào CSV mặc định |

## 8. Phác thảo kỹ thuật cho đợt 1

Thay đổi gói gọn trong `content.js` và `styles.css`; không đổi `manifest.json` ngoài số version.

```js
// Trong fetchAppInfo(), sau khi có html. Parser cũ vẫn chạy trước làm nền.
function readDetailBlock(html) {
  const re = /AF_initDataCallback\(\{key: '[^']+', hash: '[^']+', data:(.*?), sideChannel: \{\}\}\);/gs;
  for (const m of html.matchAll(re)) {
    let d;
    try { d = JSON.parse(m[1]); } catch { continue; }
    const base = d?.[1]?.[2];
    if (Array.isArray(base) && base.length > 100 && Number.isInteger(base?.[13]?.[2])) return base;
  }
  return null;
}

const pick = (o, ...path) => {
  for (const k of path) { if (o == null) return null; o = o[k]; }
  return o ?? null;
};

const b = readDetailBlock(html);
if (b) {
  const real = pick(b, 13, 2), min = pick(b, 13, 1);
  if (Number.isInteger(real) && real >= (min || 0)) info.installs = real;
  info.released   = pick(b, 10, 1, 0);           // giây
  info.updatedTs  = pick(b, 145, 0, 1, 0);
  info.hist       = [1, 2, 3, 4, 5].map((s) => pick(b, 51, 1, s, 1));
  info.price      = pick(b, 57, 0, 0, 0, 0, 1, 0); // [micros, currency, text]
  info.iap        = pick(b, 19, 0);
  info.ads        = !!pick(b, 48);
  info.genre      = pick(b, 79, 0, 0, 0);
  info.version    = pick(b, 140, 0, 0, 0);
  info.minAndroid = pick(b, 140, 1, 1, 0, 0, 1);
  info.devEmail   = pick(b, 69, 1, 0);
  info.devSite    = pick(b, 69, 0, 5, 2);
}
```

Việc kèm theo:

- **Cache:** thêm số phiên bản lược đồ vào bản ghi (`v: 2`); bản ghi cũ không có `v` coi như hết hạn để lấy trường mới.
- **Kích thước cache:** mỗi app tăng khoảng 250 byte; 1.000 app ≈ 0,25 MB.
- **Bảng:** thêm cột `installs` (thay `downloads` khi có), `released`, `perDay`, `hist`, `monet`; mặc định sort vẫn là thứ tự trang.
- **Cài đặt:** thêm cờ `exactInstalls`, `ageHighlight`, danh sách cột đang bật vào `chrome.storage.sync`.
- **Cửa hàng:** cập nhật mô tả + 1 ảnh chụp mới cho bảng; phần quyền riêng tư không đổi vì không thu thêm dữ liệu.

## 9. Cách kiểm chứng lại

Script `research/probe.py` (không cần cài thêm gì) in ra mọi trường ở mục 4.1 cho các app truyền vào:

```bash
python3 research/probe.py cc.forestapp com.whatsapp vn.fighttech.go2048
```

Nên chạy lại trước mỗi lần phát hành: nếu một trường trả về `<TypeError>` trên **mọi** app thì Google đã đổi cấu trúc.

## 10. Nguồn

- AppstoreSpy: <https://chromewebstore.google.com/detail/dclnfogoojlodlkdfnmghfbeloeojken>
- Appark: <https://chromewebstore.google.com/detail/doffdbedgdhbmffejikhlojkopaleian>
- Dữ liệu Play: tải trực tiếp từ `play.google.com` ngày 28/9/2026, `hl=en`, `gl=US` và `gl=VN`.
- Số liệu AsoSpy, Toolbox, Google Play Reviews Exporter: trang Chrome Web Store của từng extension, xem cùng ngày.
