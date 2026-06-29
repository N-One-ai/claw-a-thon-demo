

def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "live: test kết nối internet thực — chạy với -m live (bỏ qua trong CI nếu không có mạng)",
    )
