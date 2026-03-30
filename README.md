# Trading Research Dashboard

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


## v2.2 데스크톱 사용성 개선
- 임시저장(draft) 자동 보존
- 상단 상태 표시줄 및 저장 상태 표시
- 자주 쓰는 ticker/setup/tag/mistake 빠른 입력 버튼
- 라이브러리 결과 수 및 컴팩트 테이블 모드
- 키보드 단축키(Cmd/Ctrl+S, Cmd/Ctrl+D, Cmd/Ctrl+K, N)
- 라이브러리 인사이트 패널 고정


## v2.3 변경점
- 상단 브랜딩을 보다 절제된 트레이딩 데스크 톤으로 정리
- Library에 review workflow 바, 이전/다음 이동, 같은 셋업/같은 종목 빠른 필터 추가
- 선택 트레이드와 유사 샘플 비교 패널 추가
- J/K 키로 라이브러리 샘플 순차 복기 가능
