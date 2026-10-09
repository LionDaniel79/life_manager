# 개발 인계 · 2026-10-09

## 승인과 위치

기존 시간 예산 앱을 가져와 수정·검증 후 GitHub에 올리고 배포하도록 승인받았다. 개인 자료를 제외한 앱 소스 공개도 승인됨. 이미지 생성은 요청 시에만 한다.

- 작업: Documents/GitHub/life_manager, 현재 main (origin/main 추적). 개발 브랜치 feature/upstream-goals 보존.
- 원본 upstream/main: eb183868a8e3301f18e5560da6298d58f020c0db
- 기존 첫 버전: 로컬 전용 archive/local-prototype-v1. 공개하거나 push --all 하지 않는다.
- 이전 개인 기획: local-data/planning. AGENTS.md도 로컬 전용이다.
- ChatGPT 프로젝트 sources/와 analysis/weekly-time-budget 참조는 수정하지 않는다.

## 구현과 검증

src/life가 새 목표 영역이다. 원본 시간·예산·점수·통계는 유지한다. 원본 기록을 날짜별 목표 링크로 해석하고 시간 데이터는 복제하지 않는다. 생애는 문장, 시간 목표 없음은 누적만 표시한다. 여러 단기 목표가 겹치거나 배정이 유효하지 않으면 직접 선택한다. 직접 연결만 종료하며 과거 연결 기간을 보존한다.

Firestore users/{uid}/lifeManager/state에 목표·연결·배정·체중·점검을 별도 저장한다. revision 트랜잭션과 조회/저장 조정으로 다른 변경을 덮어쓰지 않는다. 목표 편집은 온라인, 원래 시간 기록은 오프라인 큐를 유지한다. 시간·예산 DB는 원본 앱과 공유된다.

원본 검사 357개를 먼저 통과했다. 통합 검사 383개와 Chromium/WebKit 브라우저 37개, 앱 자산 빌드가 통과했다. 독립 검토의 모바일 메뉴 중복 이벤트, 오래된 갱신 응답, 끊어진 배정의 수정 불가를 재현 후 수정했다. 과거 실행 시간을 오늘로 표시하던 오류도 핵심 통계의 정확성 문제로 상향 판단해 함께 수정했다. 추가 재현 검사 4개가 실패→통과했다. 최종 전체 검증 결과는 이어서 기록한다.

검토에서 유보한 운영 로그인·Firebase 권한·배포는 실제 계정 인증 후 따로 확인한다. 변경하지 않은 원본 동작과 개인 자료는 이번 검토 범위 밖이므로 기존 회귀 검사와 Git 제외 정책을 적용한다.

## 업로드·배포 완료

최종 Node 검사 385개, Chromium/WebKit 브라우저 검사 39개 통과. GitHub의 Linux CI에서도 전체 검사와 자산 빌드에 성공했다. GitHub CLI 로그인 및 workflow 권한을 사용자가 승인했고, 인증 계정은 LionDaniel79이다. 공개 저장소와 GitHub Actions Pages 설정을 마쳤다. 최초 배포 코드 커밋은 8804f232c3dbc6e74ee70f1810e780ce514a4f12이다.

- 운영: https://liondaniel79.github.io/life_manager/
- 저장소: https://github.com/LionDaniel79/life_manager
- 최초 배포 성공: https://github.com/LionDaniel79/life_manager/actions/runs/37916322760
- 최초 CI 성공: https://github.com/LionDaniel79/life_manager/actions/runs/37916322835
- 운영 release.json의 커밋과 빌드 2026.10.09-life-v28 확인. 실제 운영 URL에서 로그인 버튼 정상 활성, 설정 경고 없음, 페이지 오류 없음 확인.
- 실제 사용자로 로그인하거나 개인 기록을 새로 쓰는 검사는 하지 않았다. 기록·목표 변경·동기화는 합성 데이터 테스트 및 저장소 단위 검사로 검증했다.
- 원본 앱에 push하거나 기존 기록을 복제/이관하지 않았다. 최초 앱 사용 시 같은 Google 계정으로 로그인한다.
- 로컬은 app-start.cmd 또는 npm start. 현재 127.0.0.1:4173에서 실행 가능하다.
- 게시한 Git 이력에 개인 기획 경로가 없고, 65개 배포 파일에 개인 자료가 없는 것을 확인했다. 개인 기획과 초기 시안은 로컬 보관 브랜치와 local-data에만 남는다.

이후: 새 기능은 별도 브랜치에서 수정 → 관련 검사 → npm test 및 브라우저 검사 → main 반영/업로드 → Actions와 release.json으로 배포 확인. 새 요구가 있으면 과거 기획보다 최신 사용자 요청을 우선한다.
