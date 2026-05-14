# YES24 API (Cloud Run)

로컬 Vite의 `/api/local/books/yes24-search` 와 **동일 경로·NDJSON 스트림**을 제공합니다.  
프론트는 `VITE_YES24_API_URL` + `VITE_YES24_API_KEY` 를 설정하면 GitHub Pages에서도 YES24 버튼이 동작합니다.

## 사전 준비

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성, 결제(Blaze) 연결  
2. API 사용 설정: **Cloud Run Admin**, **Artifact Registry**, **Cloud Build** (소스에서 배포 시)  
3. [gcloud CLI](https://cloud.google.com/sdk/docs/install) 설치 후 `gcloud auth login`, `gcloud config set project YOUR_PROJECT_ID`

---

## 콘솔에서 GitHub 저장소 연결 (스크린샷처럼 연속 배포)

Cloud Run이 [저장소에서 연속 배포](https://cloud.google.com/run/docs/continuous-deployment)할 때, **Dockerfile** 방식은 공식 문서 기준으로 **Dockerfile이 있는 디렉터리가 Docker 빌드 컨텍스트**입니다.  
이 저장소는 `yes24BookScrape.ts`가 루트에 있으므로, 콘솔에서는 반드시 **저장소 루트의 `Dockerfile.yes24-api`** 를 지정하세요 (`cloud-run/yes24-api/`만 컨텍스트로 잡으면 빌드가 실패합니다).

### 순서 (Cloud Build + GitHub)

1. **API 사용 설정**  
   [Cloud Run](https://console.cloud.google.com/run), [Cloud Build](https://console.cloud.google.com/cloud-build), [Artifact Registry](https://console.cloud.google.com/artifacts) API를 켭니다. (처음 연결 시 콘솔이 안내합니다.)

2. **Cloud Run**으로 이동합니다.  
   - 새 서비스: **서비스 만들기** → **저장소에 연결**  
   - 기존 서비스(예: `ydashboard`처럼 이미 있는 경우): 서비스 클릭 → **저장소에 연결** 또는 상단 **저장소 설정 수정**(GitHub 아이콘)

3. **연결 방식**에서 **Cloud Build**를 선택합니다. (Developer Connect는 GitLab 등 다른 호스트용 흐름이 많습니다.)

4. **GitHub 인증**  
   **인증**을 눌러 Cloud Build용 GitHub 앱을 설치하고, 배포할 **조직/계정**과 **저장소** 접근을 허용합니다. 목록에 없으면 **연결된 저장소 관리**에서 추가합니다.

5. **빌드 구성**  
   - **브랜치**: 예) `^main$` 또는 `^master$` (정규식). 한 줄만 매칭되면 저장 직후 첫 빌드가 돌아갑니다.  
   - **빌드 유형**: **Dockerfile**  
   - **소스 위치(Dockerfile 경로)**: `Dockerfile.yes24-api`  
     (루트에 두었으므로 빌드 컨텍스트도 저장소 루트가 됩니다.)

6. **서비스 구성(Configure)**  
   - **리전**: 예) `asia-northeast3`(서울)  
   - **인증**: 브라우저에서 호출하려면 **인증되지 않은 호출 허용**을 켜는 경우가 많습니다(내부 전용이면 끕니다).  
   - **컨테이너 포트**: `8080` (이 이미지의 `PORT` 기본값과 동일)  
   - **메모리**: Playwright 권장 **2 GiB**, **CPU** 1~2, **요청 타임아웃** 300초 전후 권장  
   - **환경 변수 / Secret**: `YES24_API_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ALLOWED_ORIGINS` 등은 아래 **«2) Cloud Run 배포»** 절과 같이 Secret Manager에 두고 연결합니다.

7. **만들기 / 배포**를 누릅니다.  
   서비스 상세에서 **빌드 기록** 링크나 **버전** 탭으로 진행 상황을 확인합니다.

8. 이후에는 **트리거**에 맞는 브랜치에 `git push` 할 때마다 같은 흐름으로 이미지가 빌드되고 새 **버전**이 배포됩니다.  
   트리거·Dockerfile 경로를 바꾸려면 서비스 상단의 **저장소 설정 수정**으로 Cloud Build 트리거 설정을 엽니다.

공식 가이드: [Continuously deploy from a repository](https://cloud.google.com/run/docs/continuous-deployment)

---

## 1) Docker 이미지 빌드 & Artifact Registry 푸시

```bash
cd /path/to/hanuri_report   # 저장소 루트

export REGION=asia-northeast3
export PROJECT_ID=$(gcloud config get-value project)
export REPO=hanuri-docker
export IMAGE=yes24-api

gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION 2>/dev/null || true

gcloud auth configure-docker ${REGION}-docker.pkg.dev

docker build -f Dockerfile.yes24-api -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest .

docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest
```

## 2) Cloud Run 배포

비밀 값은 **Secret Manager**에 넣는 것을 권장합니다. 간단히 환경 변수로 넣으려면 아래처럼 `--set-secrets` 대신 `--set-env-vars` 로 직접 넣을 수 있으나(테스트용), 저장소에 노출되지 않게 Secret 사용을 추천합니다.

### Secret Manager 예시

```bash
echo -n '임의긴문자열-API비밀' | gcloud secrets create yes24-api-secret --data-file=-
echo -n 'YOUR_GEMINI_API_KEY' | gcloud secrets create gemini-api-key --data-file=-
```

### Cloud Run 서비스 생성

```bash
export SERVICE=yes24-api
export REGION=asia-northeast3
export PROJECT_ID=$(gcloud config get-value project)
export IMAGE_URL=${REGION}-docker.pkg.dev/${PROJECT_ID}/hanuri-docker/yes24-api:latest

gcloud run deploy $SERVICE \
  --image $IMAGE_URL \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 3 \
  --set-secrets "YES24_API_SECRET=yes24-api-secret:latest,GEMINI_API_KEY=gemini-api-key:latest" \
  --set-env-vars "GEMINI_MODEL=gemini-2.0-flash,ALLOWED_ORIGINS=https://digitalds2025.github.io"
```

- `ALLOWED_ORIGINS`: GitHub Pages 주소(프로젝트 사이트면 Origin 은 보통 `https://digitalds2025.github.io`). 여러 개는 쉼표로 구분.  
- 비어 두면 서버는 **모든 Origin** 을 허용(테스트용) — 운영에서는 반드시 지정하세요.

배포 후 출력되는 **서비스 URL** (예: `https://yes24-api-xxxxx-an.a.run.app`)을 복사합니다.

`gcloud run deploy ... --set-secrets` 를 쓰면 보통 Cloud Run 서비스 계정에 Secret 접근 권한이 자동으로 붙습니다. 콘솔에서 수동으로 환경 변수만 연결했다면, 해당 서비스 계정에 **Secret Manager Secret Accessor** 역할이 있는지 확인하세요.

## 3) GitHub Pages / Actions

저장소 **Secrets** (또는 Variables)에 다음을 추가하고 워크플로를 다시 돌립니다.

| 이름 | 값 |
|------|-----|
| `VITE_YES24_API_URL` | `https://yes24-api-xxxxx-an.a.run.app` (끝 `/` 없이) |
| `VITE_YES24_API_KEY` | Cloud Run의 `YES24_API_SECRET` 과 **동일**한 문자열(브라우저에 포함됨 — 난수 사용·유출 시 교체) |

`.github/workflows/deploy-web.yml` 의 `Build` 단계 `env`에 위 두 변수가 이미 있다면 Secrets 이름만 맞추면 됩니다. 없다면 `env` 블록에 다음 두 줄을 추가하세요.

```yaml
VITE_YES24_API_URL: ${{ secrets.VITE_YES24_API_URL }}
VITE_YES24_API_KEY: ${{ secrets.VITE_YES24_API_KEY }}
```

## 4) 로컬에서 이미지만 테스트

```bash
docker build -f Dockerfile.yes24-api -t yes24-api:local .

docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e YES24_API_SECRET=testsecret \
  -e GEMINI_API_KEY=your_key \
  -e ALLOWED_ORIGINS=http://localhost:5173 \
  yes24-api:local
```

브라우저에서 `http://localhost:5173` 의 앱이 아니라 `curl` 로 POST 테스트할 수 있습니다.

## 비용·주의

- Cloud Run은 요청 시에만 과금(무료 한도 있음). Playwright는 **메모리 2Gi** 권장.  
- Yes24 이용약관·로봇 정책을 준수하고, `YES24_API_SECRET` 으로 무분별 호출을 막으세요.
