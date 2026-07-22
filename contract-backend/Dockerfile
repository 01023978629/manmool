# 전자계약 서버 — 무의존성(Node 22 내장 http/crypto/sqlite). 빌드 단계 불필요.
FROM node:22-slim

WORKDIR /app
# 소스만 복사(의존성 없음 → npm install 없음)
COPY . .

# 운영 모드(데모/기본 페퍼 fail-fast) + 영속 DB 경로(호스팅 볼륨 마운트)
ENV NODE_ENV=production
ENV DB_PATH=/data/contract.db
ENV PORT=8787
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8787

# 헬스체크(호스팅이 별도 지정하지 않을 때 컨테이너 자체 점검)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 운영 엔트리포인트(데모 없음 · 시크릿 필수 · 0.0.0.0)
CMD ["node", "src/prod.mjs"]
