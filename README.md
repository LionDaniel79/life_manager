# Life Manager

시간 기록을 삶의 목표와 연결하는 아이폰·PC용 웹앱입니다. [weekly-time-budget](https://github.com/LionDaniel79/weekly-time-budget)의 시간 기록, 타이머, 일간·주간 예산, 성장·절제 점수와 다섯 통계를 이어받았습니다.

## 로컬 실행

`app-start.cmd`를 두 번 클릭합니다. 또는 `npm ci` 후 `npm start`를 실행하고 http://127.0.0.1:4173 을 엽니다. Node.js 22 이상이 필요하며 실행 창을 열어 두어야 합니다.

## 메뉴

- 오늘: 선택한 목표, 일간·주간 예산 진행과 점수.
- 시간: 타이머·일시정지·카운트다운, 시각/분 수동 입력, 최근 기록, 여러 단기 목표가 겹치는 기록의 배정.
- 목표 설정: 생애·장기·중기·단기 목표와 활동 연결, 선택형 시간·결과·매일 기준, 오늘 표시와 순서, 일간·주간 시간 예산.
- 통계: 주별·월간·연간·월간 비교·연도별 비교, 목표 누적, 체중, 주간 점검.
- 앱 설정: 항목 생성·수정·보관·삭제·순서, 목표 백업·복원, 전체 자료 내보내기.

## 데이터

같은 Google 계정으로 기존 시간 예산 앱의 시간·예산·항목을 그대로 사용합니다. **이 앱에서 실제 시간 기록과 예산을 수정하면 기존 앱에도 반영됩니다.** 자동 검증은 실제 계정 대신 합성 자료를 사용합니다.
목표·체중·점검은 `users/{uid}/lifeManager/state`에 별도로 저장됩니다. 원본 시간 기록은 복제하지 않고 기록일에 적용되는 목표 연결로 집계합니다. 상위 합산 시 중복 계산하지 않습니다. 여러 단기 목표가 겹치면 시간 메뉴에서 직접 배정하며, 이전 배정이 유효하지 않게 되면 다시 선택할 수 있습니다.

시간 목표가 없으면 누적만 표시합니다. 하위 목표로 상위 목표의 분모를 자동 생성하지 않습니다. 시간 달성이 결과 완료를 뜻하지 않으며, 결과값은 현재 전체 값을 직접 갱신합니다.
시간 기록은 기존 오프라인 저장과 재전송을 유지합니다. 목표 변경은 온라인 서버 저장을 확인합니다. 오프라인에서는 마지막 목표를 읽을 수 있습니다. 다른 기기의 변경을 덮어쓰지 않도록 revision을 비교합니다. 목표 문서가 800 KB를 넘으면 기존 자료를 보존하고 저장 구조 확장을 안내합니다.

사용 이력이 있는 항목은 보관합니다. 목표 백업 복원은 목표·체중·점검만 교체하고 시간·예산은 유지합니다. 전체 내보내기는 보관용이며 전체 가져오기는 없습니다.

## 검증과 배포

`npm test`, `npx playwright install chromium webkit`, `npm run test:browser`, `npm run build` 순서로 검증합니다.
`_site/`에는 공개 앱 자산만 들어갑니다. 개인 기획·분석·시안은 `local-data/`와 `analysis/`에 보관하며 Git에서 제외합니다. 기존 로컬 첫 버전의 `archive/local-prototype-v1` 브랜치는 공개하지 않습니다. **git push --all을 사용하지 마세요.**

`upstream`은 원본 저장소, `origin`은 life_manager입니다. GitHub의 정식 fork 표시와는 별도로 원본 이력을 가져온 파생 개발 공간입니다. 기존 운영 앱을 유지하고 새 Pages 경로에 배포합니다. Pages 배포 소스는 GitHub Actions로 설정합니다.
Firebase 설정은 기존 운영 웹앱의 공개 클라이언트 설정입니다. 관리자 비밀키가 아니며 실제 접근은 로그인과 firestore.rules로 제한됩니다. GitHub의 FIREBASE_* 변수로 교체할 수 있습니다.

진행 상태: [개발 인계](docs/DEVELOPMENT_HANDOFF.md). 구현 근거: [통합 계획](docs/UPSTREAM_INTEGRATION.md).

## 운영과 복구

새 배포 주소: https://liondaniel79.github.io/life_manager/ (배포 성공 후 사용). 기존 운영 주소 https://liondaniel79.github.io/weekly-time-budget/ 는 유지합니다. main에 검증한 변경을 올리면 GitHub Pages에 자동 배포됩니다. 개발은 feature/upstream-goals 같은 별도 브랜치에서 진행합니다. 실패하면 GitHub Actions의 실패 단계와 로그를 확인하고, 문제 커밋을 git revert로 되돌려 다시 배포합니다.

Firebase 승인 도메인은 liondaniel79.github.io 입니다. 로컬 로그인에 필요한 경우 localhost와 127.0.0.1도 Firebase Authentication 설정에서 승인해야 합니다. 새 프로젝트를 만들 때 Google 공급자와 firestore.rules를 적용하세요. 현재 연결은 기존 프로젝트를 사용합니다.

설정 교체 변수: FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID. FIREBASE_MEASUREMENT_ID는 선택 항목입니다. Firebase Spark 무료 한도에서 시작하며 이번 작업은 결제 계정을 새로 연결하지 않습니다.
