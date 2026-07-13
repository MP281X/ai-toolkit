FROM ghcr.io/voidzero-dev/vite-plus:latest

USER root

RUN set -eux; \
	gh_version="$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | sed -n 's/.*"tag_name": "v\([^"]*\)".*/\1/p')"; \
	architecture="$(dpkg --print-architecture)"; \
	curl -fsSL "https://github.com/cli/cli/releases/download/v${gh_version}/gh_${gh_version}_linux_${architecture}.tar.gz" \
		| tar -xz --strip-components=2 -C /usr/local/bin "gh_${gh_version}_linux_${architecture}/bin/gh"

RUN vp install --global \
		@openai/codex@latest \
		opencode-ai@latest \
		t3@latest

WORKDIR /workspace

EXPOSE 3773

CMD ["t3", "serve", "/workspace", "--host", "0.0.0.0", "--port", "3773"]
