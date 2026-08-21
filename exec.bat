@echo off
python build.py
cd site
python -m http.server 8000