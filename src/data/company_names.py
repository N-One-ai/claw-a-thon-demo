"""
Bảng tên công ty chính xác cho các mã cổ phiếu Việt Nam.
Override dữ liệu từ vnstock khi tên bị sai hoặc thiếu.

Nguồn: HOSE, HNX, trang chính thức công ty (cập nhật 2025).
"""
from __future__ import annotations

# ticker → (tên tiếng Việt ngắn gọn, tên tiếng Anh)
COMPANY_NAMES: dict[str, tuple[str, str]] = {
    # ── Ngân hàng ─────────────────────────────────────────────────────
    "VCB":  ("Vietcombank",         "Joint Stock Commercial Bank for Foreign Trade of Vietnam"),
    "BID":  ("BIDV",                "Bank for Investment and Development of Vietnam"),
    "CTG":  ("VietinBank",          "Vietnam Joint Stock Commercial Bank for Industry and Trade"),
    "TCB":  ("Techcombank",         "Vietnam Technological and Commercial Joint Stock Bank"),
    "ACB":  ("ACB",                 "Asia Commercial Joint Stock Bank"),
    "MBB":  ("MB Bank",             "Military Commercial Joint Stock Bank"),
    "VPB":  ("VPBank",              "Vietnam Prosperity Joint Stock Commercial Bank"),
    "TPB":  ("TPBank",              "Tien Phong Commercial Joint Stock Bank"),
    "HDB":  ("HDBank",              "Ho Chi Minh City Development Joint Stock Commercial Bank"),
    "STB":  ("Sacombank",           "Saigon Thuong Tin Commercial Joint Stock Bank"),
    "SHB":  ("SHBank",              "Saigon-Hanoi Commercial Joint Stock Bank"),
    "EIB":  ("Eximbank",            "Vietnam Export Import Commercial Joint Stock Bank"),
    "OCB":  ("OCB",                 "Orient Commercial Joint Stock Bank"),
    "MSB":  ("MSB",                 "Maritime Commercial Joint Stock Bank"),
    "LPB":  ("LPBank",              "Lien Viet Post Joint Stock Commercial Bank"),
    "NVB":  ("NCB",                 "National Citizen Commercial Joint Stock Bank"),
    "BAB":  ("BAOVIET Bank",        "BAOVIET Joint Stock Commercial Bank"),
    "VAB":  ("VietABank",           "Vietnam Asia Commercial Joint Stock Bank"),
    "ABB":  ("ABBank",              "An Binh Commercial Joint Stock Bank"),
    "BVB":  ("BaoViet Bank",        "Bao Viet Joint Stock Commercial Bank"),
    "PGB":  ("PGBank",              "Petrolimex Group Commercial Joint Stock Bank"),
    "NAB":  ("Nam A Bank",          "Nam A Commercial Joint Stock Bank"),
    "KLB":  ("Kienlongbank",        "Kien Long Commercial Joint Stock Bank"),
    "SSB":  ("SeABank",             "Southeast Asia Commercial Joint Stock Bank"),
    "VIB":  ("VIB",                 "Vietnam International Commercial Joint Stock Bank"),

    # ── Chứng khoán & Tài chính ───────────────────────────────────────
    "SSI":  ("Chứng khoán SSI",     "SSI Securities Corporation"),
    "VND":  ("VNDIRECT",            "VNDIRECT Securities Corporation"),
    "HCM":  ("Chứng khoán HSC",     "Ho Chi Minh City Securities Corporation"),
    "MBS":  ("MB Securities",       "MB Securities Joint Stock Company"),
    "SHS":  ("SHS",                 "Saigon-Hanoi Securities Joint Stock Company"),
    "VCI":  ("Viet Capital Securities", "Viet Capital Securities Corporation"),
    "BSI":  ("BVSC",                "Bao Viet Securities Corporation"),
    "FTS":  ("FPT Securities",      "FPT Securities Joint Stock Company"),
    "CTS":  ("Chứng khoán VCSC",    "Viet Capital Securities Corporation"),
    "TVS":  ("Thiên Việt Securities","Thien Viet Securities Corporation"),
    "AGR":  ("Agribank Securities", "Agribank Securities Company"),
    "VDS":  ("Rồng Việt Securities","Viet Dragon Securities Corporation"),

    # ── Bất động sản ──────────────────────────────────────────────────
    "VIC":  ("Vingroup",            "Vingroup Joint Stock Company"),
    "VHM":  ("Vinhomes",            "Vinhomes Joint Stock Company"),
    "VRE":  ("Vincom Retail",       "Vincom Retail Joint Stock Company"),
    "NVL":  ("Novaland",            "No Va Land Investment Group Corporation"),
    "DXG":  ("Đất Xanh Group",      "Dat Xanh Group Joint Stock Company"),
    "PDR":  ("Phát Đạt",            "Phat Dat Real Estate Development Corporation"),
    "KDH":  ("Khang Điền",          "Khang Dien House Trading and Investment Corporation"),
    "NLG":  ("Nam Long Group",      "Nam Long Investment Corporation"),
    "DIG":  ("DIC Corp",            "Development Investment Construction Corporation"),
    "HDG":  ("Hà Đô Group",         "Ha Do Group Joint Stock Company"),
    "AGG":  ("An Gia Investment",   "An Gia Investment and Development Corporation"),
    "CII":  ("CII",                 "Ho Chi Minh City Infrastructure Investment JSC"),
    "CEO":  ("CEO Group",           "CEO Group Joint Stock Company"),
    "SCR":  ("Sonadezi",            "Sonadezi Corporation"),
    "HQC":  ("Hoàng Quân",          "Hoang Quan Consulting Trading and Real Estate JSC"),
    "OGC":  ("Ocean Group",         "Ocean Group Joint Stock Company"),
    "QCG":  ("Quoc Cuong Gia Lai",  "Quoc Cuong Gia Lai Corporation"),
    "BCM":  ("Becamex IDC",         "Becamex IDC Corporation"),
    "TDC":  ("TADC",                "Thu Duc Housing Development Corporation"),
    "SZC":  ("Sonadezi Chau Duc",   "Sonadezi Chau Duc Joint Stock Company"),
    "LDG":  ("LDG Group",           "LDG Investment Joint Stock Company"),
    "NBB":  ("NBB Group",           "NBB Investment Corporation"),

    # ── Công nghệ ─────────────────────────────────────────────────────
    "FPT":  ("FPT Corp",            "FPT Corporation"),
    "CMG":  ("CMC Corporation",     "CMC Technology Corporation"),
    "ELC":  ("ELCOM",               "Electronics and Informatics Corporation"),
    "ITD":  ("ITD",                 "I.T.D. Corporation"),
    "FRT":  ("FPT Retail",          "FPT Digital Retail Joint Stock Company"),
    "FOX":  ("Fnet",                "F.I.T Group"),

    # ── Hàng tiêu dùng & Bán lẻ ──────────────────────────────────────
    "MWG":  ("Thế Giới Di Động",    "Mobile World Investment Corporation"),
    "VNM":  ("Vinamilk",            "Vietnam Dairy Products Joint Stock Company"),
    "SAB":  ("Sabeco",              "Saigon Beer Alcohol Beverage Corporation"),
    "MSN":  ("Tập đoàn Masan",      "Masan Group Corporation"),
    "MCH":  ("Masan Consumer",      "Masan Consumer Corporation"),
    "PNJ":  ("PNJ",                 "Phu Nhuan Jewelry Joint Stock Company"),
    "HAG":  ("Hoàng Anh Gia Lai",   "Hoang Anh Gia Lai International Group"),
    "DBC":  ("Dabaco",              "Dabaco Group Corporation"),
    "HNG":  ("HAGL Agrico",         "HAGL Agrico Joint Stock Company"),
    "VHC":  ("Vĩnh Hoàn",           "Vinh Hoan Corporation"),
    "ANV":  ("Nam Việt",            "Nam Viet Corporation"),
    "IDI":  ("I.D.I",               "International Development and Investment Corp"),
    "ABT":  ("Aquatex BenTre",      "Aquatex Ben Tre Joint Stock Company"),
    "FMC":  ("Sao Ta",              "Fimex VN Joint Stock Company"),
    "CMX":  ("Camimex Group",       "Camimex Group"),

    # ── Năng lượng & Dầu khí ──────────────────────────────────────────
    "GAS":  ("PV Gas",              "PetroVietnam Gas Joint Stock Corporation"),
    "PLX":  ("Petrolimex",          "Vietnam National Petroleum Group"),
    "BSR":  ("Binh Son Refinery",   "Binh Son Refining and Petrochemical Limited Company"),
    "OIL":  ("PV OIL",              "PetroVietnam Oil Corporation"),
    "PVD":  ("PV Drilling",         "PetroVietnam Drilling and Well Services Corporation"),
    "PVS":  ("PV Technical Services","PetroVietnam Technical Services Corporation"),
    "PVT":  ("PV Trans",            "PetroVietnam Transportation Corporation"),
    "POW":  ("PV Power",            "PetroVietnam Power Corporation"),
    "PGV":  ("PGV",                 "PetroVietnam Power Vung Ang Joint Stock Company"),
    "CNG":  ("CNG Việt Nam",        "CNG Vietnam Joint Stock Company"),

    # ── Tiện ích (Điện, Nước) ─────────────────────────────────────────
    "REE":  ("REE Corporation",     "Refrigeration Electrical Engineering Corporation"),
    "PC1":  ("Xây lắp Điện 1",      "Power Engineering Consulting JSC 1"),
    "GEX":  ("GELEX",               "GELEX Group Joint Stock Company"),
    "VSH":  ("Vĩnh Sơn Sông Hinh",  "Vinh Son Song Hinh Hydropower Joint Stock Company"),
    "CHP":  ("CHP",                 "Central Hydropower Joint Stock Company"),
    "SHP":  ("SHP",                 "Sao Mai Hydropower Joint Stock Company"),
    "TMP":  ("Thác Mơ",             "Thac Mo Hydropower Joint Stock Company"),
    "NT2":  ("Nhiệt điện NT2",       "PetroVietnam Power Nhon Trach 2 Joint Stock Company"),
    "BWE":  ("Nước Bình Dương",      "Binh Duong Water - Environment Corporation"),
    "TDW":  ("Nước Thủ Dầu Một",    "Thu Dau Mot Water Supply Joint Stock Company"),

    # ── Vật liệu (Thép, Hóa chất) ────────────────────────────────────
    "HPG":  ("Hòa Phát Group",      "Hoa Phat Group Joint Stock Company"),
    "HSG":  ("Tập đoàn Hoa Sen",    "Hoa Sen Group"),
    "NKG":  ("Thép Nam Kim",        "Nam Kim Steel Joint Stock Company"),
    "TLH":  ("Thép Tiến Lên",       "Tien Len Steel Corporation"),
    "VGS":  ("Ống thép Việt Đức",   "Viet Duc Metal Joint Stock Company"),
    "VCA":  ("Vicasa",              "Vicasa Steel Joint Stock Company"),
    "DGC":  ("Hóa chất Đức Giang",  "Duc Giang Chemicals Group Joint Stock Company"),
    "DCM":  ("Phân bón Cà Mau",     "Phu My Fertilizer Joint Stock Company"),
    "DPM":  ("Đạm Phú Mỹ",          "PetroVietnam Ca Mau Fertilizer Joint Stock Company"),
    "CSV":  ("Hóa chất cơ bản",     "Southern Chemical Corporation"),
    "BMP":  ("Nhựa Bình Minh",      "Binh Minh Plastics Joint Stock Company"),
    "NTP":  ("Nhựa Tiền Phong",     "Tien Phong Plastic Joint Stock Company"),

    # ── Công nghiệp & Xây dựng ────────────────────────────────────────
    "CTD":  ("Coteccons",           "Coteccons Construction Joint Stock Company"),
    "HBC":  ("Xây dựng Hòa Bình",   "Hoa Binh Construction Group Joint Stock Company"),
    "VCG":  ("Vinaconex",           "Vietnam Construction and Import Export JSC"),
    "CII":  ("CII",                 "Ho Chi Minh City Infrastructure Investment JSC"),
    "FCN":  ("FECON",               "FECON Corporation"),
    "LCG":  ("LICOGI 16",           "LICOGI 16 Corporation"),
    "C4G":  ("Cienco 4",            "Construction Corporation No.4"),
    "VGC":  ("Viglacera",           "Viglacera Corporation"),
    "ACC":  ("Xi măng An Giang",    "An Giang Cement Joint Stock Company"),
    "HT1":  ("Xi măng Hà Tiên 1",   "Ha Tien 1 Cement Joint Stock Company"),
    "BCC":  ("Xi măng Bỉm Sơn",     "Bim Son Cement Joint Stock Company"),
    "GMD":  ("Gemadept",            "Gemadept Corporation"),
    "HAH":  ("Hải An",              "Hai An Transport and Stevedoring Joint Stock Company"),
    "VSC":  ("Cảng Xanh Vinafco",   "VSC - Vinafco Container Port Joint Stock Company"),
    "ACV":  ("ACV",                 "Airports Corporation of Vietnam"),
    "SCS":  ("Saigon Cargo Service","Saigon Cargo Service Corporation"),

    # ── Y tế & Dược phẩm ─────────────────────────────────────────────
    "DHG":  ("Dược Hậu Giang",      "DHG Pharmaceutical Joint Stock Company"),
    "IMP":  ("Imexpharm",           "Imexpharm Pharmaceutical Joint Stock Company"),
    "DBD":  ("Dược Bình Định",       "Binh Dinh Pharmaceutical and Medical Equipment JSC"),
    "TRA":  ("Traphaco",            "Traphaco Joint Stock Company"),
    "PME":  ("Pymepharco",          "Pymepharco Joint Stock Company"),

    # ── Bảo hiểm ──────────────────────────────────────────────────────
    "BVH":  ("Bảo Việt Holdings",   "Bao Viet Holdings"),
    "MIG":  ("MIC",                 "Military Insurance Corporation"),
    "PVI":  ("PVI Holdings",        "PVI Holdings"),
    "PTI":  ("Bảo hiểm Bưu Điện",   "Post and Telecommunication Insurance JSC"),

    # ── Nông nghiệp ───────────────────────────────────────────────────
    "LAS":  ("Lâm đặc sản Bắc Bộ",  "Northern Forestry Products Corp"),
    "SRC":  ("Cao su Sao Vàng",      "Sao Vang Rubber Joint Stock Company"),
    "PHR":  ("Cao su Phước Hòa",     "Phuoc Hoa Rubber Joint Stock Company"),
    "DPR":  ("Cao su Đồng Phú",      "Dong Phu Rubber Joint Stock Company"),
    "TPC":  ("Cao su Tân Biên",      "Tan Bien Rubber Company"),

    # ── Khác ──────────────────────────────────────────────────────────
    "KBC":  ("Kinh Bắc City",       "Kinh Bac City Development Holding Corporation"),
    "SZL":  ("Sonadezi Long Thành", "Sonadezi Long Thanh Joint Stock Company"),
    "VGT":  ("Vinatex",             "Vietnam National Textile and Garment Group"),
    "TCM":  ("Dệt may Thành Công",  "Thanh Cong Textile Garment Investment Trading JSC"),
    "TNG":  ("TNG Holdings",        "TNG Investment and Trading Joint Stock Company"),
    "MSH":  ("May Sông Hồng",       "Song Hong Garment Joint Stock Company"),
    "STK":  ("Sợi Thế Kỷ",          "Century Synthetic Fiber Corporation"),
    "VTO":  ("Vận tải Xăng dầu",    "Petroleum Transportation Joint Stock Company"),
    "GSP":  ("Gas South",           "Southern Gas Distribution Joint Stock Company"),
    "PLC":  ("Hoá dầu Petrolimex",  "Petrolimex Chemical & Petroleum Corporation"),
    "VFG":  ("Thuốc sát trùng VN",  "Vietnam Pesticide Joint Stock Company"),
    "PAC":  ("Ắc quy Tia Sáng",     "Tia Sang Battery Joint Stock Company"),
    "GEL":  ("GREENFEED",           "Greenfeed Vietnam Corporation"),
    "CRE":  ("Cenland",             "Cen Land Real Estate Joint Stock Company"),
    "SIP":  ("SIP",                 "Saigon Industrial Investment Corporation"),
    "IJC":  ("IDICO - Becamex",     "IDICO Corporation"),
    "D2D":  ("SONADEZI Đồng Nai",   "Sonadezi Dong Nai Industrial Zone JSC"),
    "SBT":  ("TTC Sugar",           "Thanh Thanh Cong - Bien Hoa Sugar JSC"),
    "LSS":  ("Đường Lam Sơn",       "Lam Son Sugar Joint Stock Company"),
    "QNS":  ("Đường Quảng Ngãi",    "Quang Ngai Sugar Joint Stock Company"),
    "BHS":  ("Đường Biên Hòa",      "Bien Hoa Sugar Joint Stock Company"),
    "HAX":  ("Haxaco",              "Haxaco Automobile Joint Stock Company"),
    "SVC":  ("Savico",              "Saigon General Service Corporation"),
    "VEA":  ("Vimeco",              "Vietnam Engine and Agricultural Machinery Corporation"),
    "VOS":  ("Vận tải biển VN",     "Vietnam Ocean Shipping Joint Stock Company"),
    "PVP":  ("PV Trans Pacific",    "PetroVietnam Trans Pacific Shipping JSC"),
}


def get_company_name(ticker: str, fallback: str = "") -> str:
    """
    Trả về tên tiếng Việt chính xác cho mã cổ phiếu.
    Nếu không có trong mapping, trả về fallback (thường là tên từ vnstock).
    """
    entry = COMPANY_NAMES.get(ticker.upper())
    if entry:
        return entry[0]
    return fallback


def get_company_name_en(ticker: str, fallback: str = "") -> str:
    """Tên tiếng Anh chính xác."""
    entry = COMPANY_NAMES.get(ticker.upper())
    if entry:
        return entry[1]
    return fallback
