# Codex 서브에이전트 번들 (v103)

`.claude/agents/`와 동일한 10종을 Codex TOML 형식으로 정의한 것입니다.
운영 원칙(단일 쓰기·승인 게이트·PII 금지)은 `.claude/agents/README.md`를 기준으로 합니다.

- 읽기 전용 리뷰어: `sandbox_mode = "read-only"`
- 쓰기 에이전트: `sandbox_mode = "workspace-write"`
- model 미지정 → Codex 기본 모델 상속 (필요 시 각 파일에 `model = "..."` 추가)
