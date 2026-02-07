lint:
	python3 -m flake8 scripts tests run_all_tests.py

test:
	python3 run_all_tests.py

clean:
	find . -name "__pycache__" -type d -prune -exec rm -rf {} +
	find . -name "*.pyc" -type f -delete
	find . -name "*.log" -type f -delete
	find . -name "*.tmp" -type f -delete
