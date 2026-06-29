# SKILL: Phân Tích & Đánh Giá Cổ Phiếu

> Skill đánh giá tổng hợp giá cổ phiếu tại thời điểm hiện tại.
> Đầu vào: **mã cổ phiếu** (VD: VCB, FPT, HPG).
> Đầu ra: **khuyến nghị MUA / GIỮ / BÁN** kèm lý do, mức giá, biên an toàn, cảnh báo rủi ro.

---

## 1. Tổng Quan

Skill tổng hợp **4 yếu tố phân tích** từ dữ liệu thị trường thực:

| # | Yếu tố | Trọng số | Mô tả |
|---|---|---|---|
| 1 | **Định giá** | 40% | So sánh giá hiện tại với giá trị nội tại từ 4 mô hình |
| 2 | **Kỹ thuật** | 25% | RSI, MACD, xu hướng giá, vị trí so với SMA |
| 3 | **Rủi ro** | 20% | Beta, nợ/vốn, khả năng trả lãi, biến động giá |
| 4 | **Xu hướng** | 15% | Vị trí trong biên độ 52 tuần, xu hướng khối lượng |

Công thức tổng hợp:

```
Điểm = Định_giá × 0.40 + Kỹ_thuật × 0.25 + Rủi_ro × 0.20 + Xu_hướng × 0.15
```

Mỗi yếu tố cho điểm từ **0 đến 100**. Kết quả cuối cùng (0–100) quyết định khuyến nghị.

---

## 2. Bảng Khuyến Nghị

| Điểm | Khuyến nghị | Ý nghĩa |
|---|---|---|
| **75 – 100** | MUA MẠNH | Cổ phiếu rẻ hơn giá trị thực đáng kể, tín hiệu kỹ thuật tích cực, rủi ro thấp |
| **60 – 74** | MUA | Giá hợp lý hoặc hơi rẻ, tín hiệu trung lập đến tích cực |
| **40 – 59** | NẮM GIỮ | Giá xấp xỉ giá trị hợp lý, không có lý do mạnh để mua thêm hoặc bán |
| **25 – 39** | BÁN | Giá cao hơn giá trị thực, hoặc rủi ro tăng |
| **0 – 24** | BÁN MẠNH | Giá đắt hơn đáng kể so với giá trị thực, tín hiệu tiêu cực, rủi ro cao |

---

## 3. Đánh Giá Mức Giá

Dựa trên phần trăm chiết khấu so với giá trị hợp lý (consensus fair value):

| Chiết khấu | Mức giá | Giải thích |
|---|---|---|
| > +25% | **Rất rẻ** | Giá thị trường thấp hơn giá trị thực 25%+ |
| +10% → +25% | **Đang rẻ** | Chiết khấu vừa phải, biên an toàn tốt |
| -10% → +10% | **Hợp lý** | Giá xấp xỉ giá trị nội tại |
| -25% → -10% | **Đang đắt** | Giá cao hơn giá trị hợp lý |
| < -25% | **Rất đắt** | Giá vượt xa giá trị nội tại, rủi ro giảm giá cao |

---

## 4. Chi Tiết Từng Yếu Tố

### 4.1 Định Giá (40%)

Sử dụng 4 mô hình định giá, tổng hợp thành **giá trị hợp lý đồng thuận**:

| Mô hình | Công thức | Trọng số theo ngành |
|---|---|---|
| **P/E Fair Value** | `EPS_TTM × P/E ngành` | Ngân hàng: 25%, Công nghệ: 25% |
| **P/B Fair Value** | `BVPS × P/B ngành` | Ngân hàng: 35%, Công nghệ: 10% |
| **Chỉ số Graham** | `√(22.5 × EPS × BVPS)` | 15–20% tùy ngành |
| **DCF (5 năm)** | Chiết khấu FCF + Terminal Value | Công nghệ: 50%, Ngân hàng: 20% |

**Earnings Yield** (Tỷ suất lợi nhuận) cũng được tính:
```
EY = EPS_TTM / Giá × 100%
Spread = EY - Lãi suất trái phiếu 10 năm
Hấp dẫn khi Spread > 3%
```

Cách chấm điểm:

| Chiết khấu so với GTHL | Điểm |
|---|---|
| > 40% | 98 |
| 30–40% | 90 |
| 20–30% | 80 |
| 10–20% | 65 |
| 0–10% | 55 |
| -10–0% | 40 |
| -20–(-10%) | 25 |
| -30–(-20%) | 15 |
| < -30% | 5 |

### 4.2 Kỹ Thuật (25%)

| Tín hiệu | Điều kiện | Điểm cộng/trừ |
|---|---|---|
| RSI < 30 (quá bán) | Tiềm năng hồi phục | +15 |
| RSI 30–40 | Vùng tích lũy | +8 |
| RSI 60–70 | Bắt đầu nóng | -5 |
| RSI > 70 (quá mua) | Có thể điều chỉnh | -15 |
| MACD tín hiệu Mua | Đường MACD cắt lên signal | +12 |
| MACD tín hiệu Bán | Đường MACD cắt xuống signal | -12 |
| Xu hướng Tăng mạnh | Giá trên SMA20/50/200 | +10 |
| Xu hướng Giảm | Giá dưới các đường SMA | -10 |
| Giá trên SMA50 | Xu hướng trung hạn tích cực | +5 |
| Giá trên SMA200 | Xu hướng dài hạn tích cực | +5 |

Điểm gốc: **50**. Cộng/trừ theo tín hiệu. Kẹp trong [0, 100].

### 4.3 Rủi Ro (20%)

| Mức rủi ro tổng thể | Điểm gốc |
|---|---|
| Thấp | 85 |
| Trung bình | 55 |
| Cao | 30 |
| Rất cao | 10 |

Điều chỉnh thêm:

| Điều kiện | Điều chỉnh |
|---|---|
| Beta < 0.8 | +5 (ít biến động) |
| Beta > 1.5 | -8 (biến động mạnh) |
| Nợ/Vốn < 0.5 | +5 (tài chính lành mạnh) |
| Nợ/Vốn > 2.0 | -8 (đòn bẩy cao) |

### 4.4 Xu Hướng (15%)

| Tín hiệu | Điều kiện | Điểm cộng/trừ |
|---|---|---|
| Gần đáy 52 tuần (< 25%) | Tiềm năng hồi phục | +15 |
| Vùng thấp (25–40%) | Còn dư địa tăng | +8 |
| Gần đỉnh (> 85%) | Rủi ro điều chỉnh | -12 |
| Vùng cao (70–85%) | Cần cẩn trọng | -5 |
| Khối lượng tăng mạnh | Xác nhận xu hướng | +8 |
| Khối lượng giảm | Thiếu xác nhận | -5 |

---

## 5. Độ Tin Cậy

Mỗi phân tích kèm **độ tin cậy** (0–100%) phản ánh chất lượng dữ liệu:

| Điều kiện | Đóng góp |
|---|---|
| Có dữ liệu định giá | +40% |
| Có dữ liệu kỹ thuật | +25% |
| Có dữ liệu rủi ro | +20% |
| ≥ 3 mô hình định giá khả dụng | +15% |
| 2 mô hình | +8% |
| < 2 mô hình | +0% |

Khi thiếu dữ liệu, trọng số được phân bổ lại tự động cho các yếu tố còn lại.

---

## 6. Đầu Ra

Sau khi phân tích, skill trả về:

```
╔═══════════════════════════════════════════════════════════╗
║  ▶ MUA MẠNH                    Mức giá: Đang rẻ         ║
╠═══════════════════════════════════════════════════════════╣
║  Giá hiện tại    : 89.500 ₫                              ║
║  Giá mục tiêu    : 112.000 ₫                             ║
║  Biên an toàn    : +25,1%                                 ║
║  Độ tin cậy      : 95% (4/4 mô hình)                     ║
╠═══════════════════════════════════════════════════════════╣
║  ĐIỂM TỔNG HỢP: 82/100                                   ║
║                                                           ║
║  Định giá   ████████░░  85                                ║
║  Kỹ thuật   ███████░░░  72                                ║
║  Rủi ro     ███████░░░  78                                ║
║  Xu hướng   ██████░░░░  65                                ║
╠═══════════════════════════════════════════════════════════╣
║  ✓ LÝ DO                                                  ║
║  💰 Chiết khấu 25,1% so với GTHL — cơ hội tốt            ║
║  📈 Tỷ suất lợi nhuận hấp dẫn hơn lãi suất trái phiếu   ║
║  🟢 RSI 38 — vùng quá bán, có thể hồi phục               ║
║  ▲  MACD phát tín hiệu Mua                                ║
║  🛡️ Hồ sơ rủi ro thấp — phù hợp đầu tư dài hạn          ║
╠═══════════════════════════════════════════════════════════╣
║  ⚠ LƯU Ý                                                  ║
║  📊 Beta 1.52 — biến động mạnh hơn thị trường             ║
╚═══════════════════════════════════════════════════════════╝
```

---

## 7. Cách Sử Dụng

### 7.1 Giao diện Web (Dashboard)

1. Truy cập `http://localhost:3000`
2. Nhập mã cổ phiếu (VD: `FPT`)
3. Nhấn **Phân tích ngay**
4. Kết quả hiển thị tự động:
   - **KPI Cards**: Điểm đầu tư, Giá mục tiêu, Tiềm năng, Rủi ro
   - **Đánh giá tổng hợp**: Panel MUA/GIỮ/BÁN với 4 yếu tố và lý do
   - **Các tab chi tiết**: Định giá, Sức khỏe DN, Rủi ro, Kỹ thuật, Kịch bản, Báo cáo AI

### 7.2 CLI (Dòng lệnh)

```bash
# Phân tích đơn lẻ
python -m src.main --ticker VCB

# Phân tích batch — so sánh nhiều mã
python -m src.main --tickers VCB,FPT,HPG,VNM

# Quét watchlist — lọc mã hấp dẫn
python -m src.main --watchlist VCB,FPT,HPG --alert-threshold 15 --max-risk MEDIUM

# Xuất PDF
python -m src.main --ticker VCB --output pdf

# Streaming (AI viết từng đoạn)
python -m src.main --ticker VCB --stream
```

### 7.3 API Server

```bash
# Khởi động server
python -m src.main --serve --port 8080

# Gọi API
curl http://localhost:8080/analyze/VCB
```

Response chứa `valuation`, `technical`, `risk` — frontend tự tính verdict từ dữ liệu này.

---

## 8. Nguồn Dữ Liệu

| Dữ liệu | Nguồn | Tần suất |
|---|---|---|
| Giá cổ phiếu | vnstock (HOSE/HNX) | Thời gian thực |
| Báo cáo tài chính | vnstock / SSI / TCBS | Hàng quý |
| P/E, P/B ngành | `config/sector_benchmarks.yaml` | Cập nhật hàng quý |
| WACC mặc định | `config/wacc_defaults.yaml` | Cập nhật hàng quý |
| Lãi suất phi rủi ro | Trái phiếu Chính phủ VN 10 năm | Biến số `.env` |

---

## 9. Giới Hạn

- **Không phải khuyến nghị đầu tư.** Skill cung cấp phân tích định lượng để tham khảo.
- **Dữ liệu quá khứ không đảm bảo tương lai.** Các mô hình dựa trên dữ liệu lịch sử.
- **Chưa tính yếu tố vĩ mô.** Lãi suất, tỷ giá, chính sách không được mô hình hóa.
- **Dữ liệu tài chính có độ trễ.** BCTC cập nhật hàng quý, giá cập nhật hàng ngày.
- **Cổ phiếu mới niêm yết** có thể thiếu dữ liệu → độ tin cậy thấp.

---

## 10. Kiến Trúc Kỹ Thuật

```
Người dùng nhập mã cổ phiếu
        │
        ▼
┌──────────────────────┐
│  Backend (Python)     │
│  ┌────────────────┐  │
│  │ vnstock API    │──┼──→ Giá, BCTC, lịch sử giao dịch
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ ValuationEngine│──┼──→ P/E, P/B, Graham, DCF, EY
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ TechnicalAnalyzer──┼──→ RSI, MACD, SMA, 52W, Volume
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ RiskAnalyzer   │──┼──→ Beta, D/E, Coverage, Stability
│  └────────────────┘  │
│          │            │
│          ▼            │
│  JSON Response        │
└──────────┬────────────┘
           │
           ▼
┌──────────────────────┐
│  Frontend (Next.js)   │
│  ┌────────────────┐  │
│  │ verdict.ts     │──┼──→ Tính điểm 4 yếu tố → Composite Score
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ StockVerdict   │──┼──→ UI: Badge MUA/BÁN + Lý do + Cảnh báo
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ KPICards       │──┼──→ Giá mục tiêu, Biên an toàn, Rủi ro
│  └────────────────┘  │
└──────────────────────┘
```

### File liên quan

| File | Vai trò |
|---|---|
| `web/src/lib/verdict.ts` | Bộ não tính điểm — scoring engine |
| `web/src/components/dashboard/StockVerdict.tsx` | Giao diện hiển thị khuyến nghị |
| `web/src/components/dashboard/KPICards.tsx` | KPI cards (giá mục tiêu, biên an toàn, risk badge) |
| `web/src/lib/utils.ts` | Hàm tiện ích (computeInvestmentScore, riskBg, labelColor) |
| `web/src/locales/vi.ts` | Toàn bộ text tiếng Việt cho skill |
| `src/analysis/valuation.py` | Backend: 4 mô hình định giá |
| `src/analysis/technical.py` | Backend: RSI, MACD, SMA, volume |
| `src/analysis/risk.py` | Backend: Beta, D/E, coverage, stability |
| `src/analysis/financial.py` | Backend: xử lý BCTC |
| `src/pipeline.py` | Backend: pipeline tổng hợp |
| `src/server.py` | Backend: FastAPI endpoints |
