# Docker 사용 가이드

## 빠른 시작

### 1. 프로덕션 환경 실행 (Synology NAS)

**기본 설정으로 실행:**
```bash
# 이미지 빌드 및 컨테이너 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f

# 중지
docker-compose down
```

**별도 프로덕션 설정으로 실행:**
```bash
# 프로덕션 전용 compose 파일로 실행
docker-compose -f docker-compose.prod.yml up -d
```

접속 URL: `http://anselmjeong.synology.me:7127`

### 2. 개발 환경 실행

```bash
# 개발용 컨테이너 실행
docker-compose -f docker-compose.dev.yml up -d

# 로그 확인
docker-compose -f docker-compose.dev.yml logs -f
```

## 환경 변수 설정

### Docker 환경에서 중요한 환경 변수들:

- `NEXT_PUBLIC_WEBSITE_URL`: 애플리케이션 접근 URL
  - 로컬 개발: `http://localhost:7127`
  - Synology NAS: `http://anselmjeong.synology.me:7127`
  - 일반 프로덕션: `https://your-domain.com`
- `NODE_ENV`: 실행 환경 (`development` 또는 `production`)
- `PORT`: 애플리케이션 포트 (기본값: 7127)
- `HOSTNAME`: 바인딩 호스트 (Docker에서는 `0.0.0.0`)

### 커스텀 환경 변수 설정:

#### 방법 1: docker-compose.yml에서 직접 설정 (현재 설정)
```yaml
environment:
  - NEXT_PUBLIC_WEBSITE_URL=http://anselmjeong.synology.me:7127
```

#### 방법 2: .env.local 파일 사용
1. `.env.local` 파일을 `apps/reader/` 디렉토리에 생성:
```bash
# apps/reader/.env.local
NEXT_PUBLIC_WEBSITE_URL=http://anselmjeong.synology.me:7127
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
```

2. `docker-compose.yml`에서 `env_file` 섹션 활성화:
```yaml
services:
  reader:
    # environment 섹션을 주석처리하고
    env_file:
      - ./apps/reader/.env.local
```

#### 방법 3: 별도 프로덕션 compose 파일 사용
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## 프로덕션 배포

### 1. 리버스 프록시와 함께 사용 (nginx, traefik 등)

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  reader:
    container_name: flow-reader
    build:
      context: .
      dockerfile: ./Dockerfile
    restart: unless-stopped
    ports:
      - "7127:7127"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_WEBSITE_URL=https://your-domain.com
    networks:
      - web

networks:
  web:
    external: true
```

### 2. SSL/TLS 설정

HTTPS를 사용하는 경우 `NEXT_PUBLIC_WEBSITE_URL`을 적절히 설정하세요:

```bash
NEXT_PUBLIC_WEBSITE_URL=https://your-domain.com
```

## 트러블슈팅

### 일반적인 문제들:

1. **포트 충돌**: 7127 포트가 이미 사용 중인 경우
   ```bash
   # docker-compose.yml에서 포트 변경
   ports:
     - "8080:7127"  # 호스트 포트를 8080으로 변경
   ```

2. **권한 문제**: 
   ```bash
   # 컨테이너 재시작
   docker-compose down && docker-compose up -d
   ```

3. **빌드 캐시 문제**:
   ```bash
   # 캐시 없이 재빌드
   docker-compose build --no-cache
   ```

4. **메모리 부족**:
   ```bash
   # Docker Desktop에서 메모리 할당량 증가 (최소 4GB 권장)
   ```

### 로그 확인:

```bash
# 실시간 로그
docker-compose logs -f reader

# 특정 시간대 로그
docker-compose logs --since="2024-01-01T00:00:00" reader
```

### 컨테이너 상태 확인:

```bash
# 컨테이너 상태
docker-compose ps

# Health check 상태
docker inspect flow-reader --format='{{.State.Health.Status}}'
```

## 성능 최적화

### 1. 멀티스테이지 빌드 최적화

현재 Dockerfile은 이미 멀티스테이지 빌드를 사용하여 최적화되어 있습니다.

### 2. 이미지 크기 최적화

- Alpine Linux 베이스 이미지 사용
- 빌드 의존성과 런타임 의존성 분리
- .dockerignore 활용

### 3. 캐싱 최적화

```bash
# BuildKit 활성화 (더 나은 캐싱)
DOCKER_BUILDKIT=1 docker-compose build
```

## 백업 및 복원

### 데이터 볼륨 사용 시:

```bash
# 백업
docker run --rm -v flow_reader_data:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz -C /data .

# 복원
docker run --rm -v flow_reader_data:/data -v $(pwd):/backup alpine tar xzf /backup/backup.tar.gz -C /data
``` 