# Trading Desk Dashboard v3

개인용 로컬 트레이딩 워크스테이션으로 개편한 버전입니다.

## 핵심 변경
- schema v3 마이그레이션
- `liveNotes` 정식 저장
- 부분청산 이후 `realized / unrealized / residualRisk / remainingQty` 계산
- `book / marketRegime / biasTimeframe / catalyst / invalidation / checklist / verdict / improvements` 추가
- 구조화된 evidence(`entryChart / exitChart / extra[]`)
- Overview에 최근 20트레이드, Emotion Breakdown, Playbook Score 보드 추가
- Library에 `side / session / setup / emotion / tag / mistake / grade / playbook score` 필터 추가
- A급 + 고점수 + 무실수 조건의 Playbook 갤러리 강화
- localStorage + JSON import/export 유지

## 파일 구조
- `index.html`
- `css/styles.css`
- `js/app.js`
- `js/storage.js`
- `js/calc.js`
- `js/analytics.js`

## 실행
정적 호스팅 환경에서 바로 사용 가능합니다.
GitHub Pages 또는 로컬 서버에서 열면 됩니다.

## 참고
기존 `btc_trading_research_dashboard_v2` localStorage 데이터와
구형 v5 JSON 배열 import를 v3로 마이그레이션하도록 설계했습니다.


## v3.2 UI refresh
- 전체 라이트 테마 리디자인
- Overview를 원래의 간결한 레이아웃으로 복원
- Journal에서 Book / Market Regime / Bias Timeframe / Verdict 제거
- Checklist / 추가 증거 링크 제거
- 계좌 잔고 입력부를 은행 앱 스타일의 간결한 스냅샷 UI로 재구성
