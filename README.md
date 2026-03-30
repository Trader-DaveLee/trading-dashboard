# BTC Trading Research Dashboard v2

이 버전은 기존 단일 HTML 구조를 멀티 파일 구조로 재구성한 1차 구현본입니다.

## 포함 범위
- Overview / Journal / Library / Research 4개 화면
- 분할 진입/청산 + 수수료 + R 계산
- v5 JSON 배열 import 시 v2 스키마로 마이그레이션
- localStorage 기반 저장
- 태그 / 실수 / 감정 / 플레이북 점수 기록
- 장기 복기를 위한 검색/필터/상세 패널

## 파일 구조
- `index.html`
- `css/styles.css`
- `js/app.js`
- `js/storage.js`
- `js/calc.js`
- `js/analytics.js`

## 다음 단계 제안
- 세션/태그/실수 기준의 더 정교한 연구 차트 추가
- 부분청산 상태를 더 세밀하게 관리
- evidence 타입 구조화
- JSON schema validation 및 migration 강화
- 모바일 입력 UX 개선
