# Trading Desk Dashboard

개인용 트레이딩 스타트 페이지 + 저널 + 리스크 설계 도구입니다.

## 현재 핵심 구조
- Overview: 첫 화면, 포트폴리오/퀵런치/성과 요약
- Journal: Pre-Trade → Risk & Execution → Live Management → Post-Trade Assessment
- Library: 과거 트레이드 검색/복기
- Playbook: 재사용할 패턴 샘플 모음

## Risk & Execution 개편 포인트
- 현재가 / 손절가 / 목표가 / Mark Price를 기준으로 주문 설계
- Planner Mode
  - 단일 진입
  - 균형 분할
  - 눌림 분할 (Cost Averaging)
  - 피라미딩 (추세 추가)
- 진입 단계 수와 비중 스타일을 조합해 추천 진입 구조 계산
- Execution Entries는 실제 체결 기준
- Target / Filled Exits는 계획과 실제 청산을 함께 관리
- Scale-In Simulator로 추가 진입 전후 평균단가/리스크/목표 수익 변화를 미리 확인 가능

## Post-Trade Assessment
- 사용 리스크 / 허용 리스크
- 예상/최종 PnL
- 예상/최종 R
- 잔여 리스크 / BEP
- 누적 수수료 / 계좌 영향
- 자동 복기 문구

## 구현 메모
- LocalStorage 기반 저장
- JSON import/export 지원
- schemaVersion 4 사용
- quickLinks, checklists, balanceHistory 등 meta 구조 포함

## 다음 우선순위 후보
1. plan vs execution 비교 레이어
2. multiple target 고도화
3. stop moved / BEP / trailing stop 이벤트 구조화
4. import/migration 안전성 추가 강화


## Latest cleanup
- Removed session field from Journal and Library workflows.
- Removed micro-adjustment input and sidebar scale-in/target projection cards.
- Unified current price as the single live pricing input for planner and unrealized PnL.
- Playbook now uses chart links only (no placeholder image blocks).
