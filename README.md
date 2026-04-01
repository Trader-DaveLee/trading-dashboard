# Trading Desk Dashboard (Pro Edition)

개인 트레이딩의 모든 과정을 기록, 분석, 복기하기 위해 구축된 로컬 기반 트레이딩 워크스테이션입니다. 
무거운 백엔드나 프레임워크 없이 순수 Vanilla JS와 LocalStorage만으로 동작하며, GitHub Pages를 통한 정적 호스팅에 완벽히 최적화되어 있습니다.

## 🔥 핵심 기능 (Core Features)

### 1. 강력한 트레이딩 저널 (4-Phase Workflow)
실제 트레이딩 심리 단계에 맞춘 직관적인 기록 플로우를 제공합니다.
* **Pre-Trade Context:** 시장 컨텍스트, 진입 논리, 진입 전 차트 증거 기록
* **Risk & Execution:** 계좌 잔고 기반 리스크 자동 계산, 분할 진입/청산(Scaling In/Out) 가중치 설정
* **Live Management:** 포지션 보유 중 발생하는 심리 및 대응을 시간순(Time-stamped)으로 기록
* **Post-Trade Review:** 사후 복기, 실수 태그, 최종 매매 등급(Grade S~D) 평가

### 2. 정교한 리스크 및 성과 분석 (Advanced Analytics)
* **Realized / Unrealized 분리:** 확정 수익(Realized R)과 평가 수익(Unrealized R)을 분리하여 잔여 익스포저(Residual Risk)를 정확히 추적합니다.
* **자금 흐름 분리:** Account Status에서 매매 손익(PnL)과 단순 입출금(Deposit/Withdrawal)을 분리 기록하여 순수 매매 성과를 왜곡 없이 측정합니다.
* **청산 비율 검증:** 청산 비중 합계 100% 초과 방지 및 OPEN/CLOSED 상태에 따른 논리적 검증 로직이 포함되어 있습니다.

### 3. A+ Playbook & Library
* **Playbook 갤러리:** S등급 및 A등급으로 평가된 최고의 셋업들만 모아보는 갤러리 뷰를 제공합니다. (TradingView 링크 연동 시 썸네일 및 View Chart 버튼 자동 생성)
* **스마트 라이브러리:** 월간 Heatmap 캘린더에서 특정 일자 클릭 시 해당 날짜의 매매 기록으로 즉시 이동(Jump)하며, 종목/셋업별 유사 샘플을 자동으로 대조합니다.

### 4. 프리미엄 UI & 모바일 최적화 (Responsive Design)
* **Premium Light Theme:** 높은 가독성과 세련된 그림자 이펙트(Soft shadow)를 적용한 금융권/SaaS 스타일의 UI.
* **Mobile-Friendly:** 좁은 화면에서도 레이아웃이 1열(1-Column)로 자연스럽게 재배치되며, 엄지손가락으로 쉽게 탭을 이동할 수 있는 하단 네비게이션(Bottom Tab Bar)을 지원합니다.

## 📂 파일 구조 (Project Structure)
```text
📦 trading-dashboard
 ┣ 📂 css
 ┃ ┗ 📜 styles.css       # 반응형 UI, 테마, 애니메이션 스타일링
 ┣ 📂 js
 ┃ ┣ 📜 app.js          # DOM 조작, 이벤트 바인딩, 뷰(View) 라우팅
 ┃ ┣ 📜 calc.js         # 수수료, R-Multiple, 명목 노출 등 수학적 계산 로직
 ┃ ┣ 📜 analytics.js    # 누적 데이터 그룹화, 승률 및 통계 요약
 ┃ ┗ 📜 storage.js      # LocalStorage 읽기/쓰기 및 JSON 데이터 마이그레이션
 ┣ 📜 index.html        # 대시보드 메인 마크업
 ┗ 📜 README.md         # 프로젝트 문서
