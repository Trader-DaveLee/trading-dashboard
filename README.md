# Trading Desk Dashboard v6.6

## 이번 업데이트
- 저장소를 **LocalStorage 캐시 + IndexedDB 영속 저장소** 구조로 확장
- 차트 증거(Entry/Exit/Live)에 **링크 입력 + 이미지 붙여넣기(Ctrl+V) + 드래그 앤 드롭 + 파일 선택** 지원
- 차트 이미지(Data URL)도 트레이드 데이터와 함께 저장되며 Playbook/Library에서 미리보기 가능
- 저장 레이어 일부 모듈화 (`idb.js`, `media.js`)로 향후 유지보수 기반 정리

## 저장 구조
- 빠른 부팅과 호환성을 위해 LocalStorage는 캐시 용도로 유지
- 실제 영속 저장은 IndexedDB를 우선 사용
- 브라우저가 지원하는 범위 내에서 더 많은 트레이드 및 차트 자료 저장 가능

## 차트 증거 입력 방식
- TradingView 링크를 붙여넣고 Enter
- 이미지 파일을 드래그 앤 드롭
- 이미지 캡처를 Ctrl+V로 바로 붙여넣기
- `파일` 버튼으로 직접 업로드

## 향후 권장
- Journal / Library / Overview 뷰 분리 리팩토링
- 계획(Plan)과 실행(Execution) 완전 분리
- 첨부 이미지 썸네일 정리 및 갤러리 모드 강화
