def pytest_addoption(parser):
    parser.addoption("--model-path", default=None, help="Path to ONNX model for frame tests")


import pytest

@pytest.fixture
def model_path(request):
    return request.config.getoption("--model-path")
