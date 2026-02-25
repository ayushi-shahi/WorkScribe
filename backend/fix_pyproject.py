content = "[project]\n"
content += 'name = "workscribe-backend"\n'
content += 'version = "1.0.0"\n'
content += 'requires-python = ">=3.12"\n'
content += "dependencies = []\n"
content += "\n"
content += "[tool.pytest.ini_options]\n"
content += 'asyncio_mode = "auto"\n'
content += 'testpaths = ["tests"]\n'
content += 'python_files = ["test_*.py"]\n'
content += 'python_classes = ["Test*"]\n'
content += 'python_functions = ["test_*"]\n'
content += 'addopts = ["-v", "--strict-markers", "--tb=short"]\n'
content += "\n"
content += "[build-system]\n"
content += 'requires = ["setuptools>=68.0"]\n'
content += 'build-backend = "setuptools.build_meta"\n'

with open("/app/pyproject.toml", "w") as f:
    f.write(content)
print("done")
