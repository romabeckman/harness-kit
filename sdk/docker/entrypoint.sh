#!/bin/sh
set -e

echo "[BOOTSTRAP] Configurando ambiente Git..."

# 1. Configurar credenciais do Git para commit automatizado
git config --global user.name "${GIT_COMMIT_AUTHOR_NAME:-HRNS Automation}"
git config --global user.email "${GIT_COMMIT_AUTHOR_EMAIL:-automation@hrns.local}"

# 2. Injetar chave SSH privada caso fornecida em variável de ambiente
if [ -n "$GIT_SSH_PRIVATE_KEY" ]; then
    echo "[BOOTSTRAP] Configurando chave SSH para acesso ao Git..."
    mkdir -p /root/.ssh
    chmod 700 /root/.ssh
    echo "$GIT_SSH_PRIVATE_KEY" > /root/.ssh/id_ed25519
    chmod 600 /root/.ssh/id_ed25519
    ssh-keyscan github.com gitlab.com bitbucket.org >> /root/.ssh/known_hosts 2>/dev/null || true
fi

# 3. Injetar token HTTPS caso fornecido (ex: GitHub PAT)
if [ -n "$GIT_TOKEN" ]; then
    echo "[BOOTSTRAP] Configurando Git Credential Store..."
    git config --global credential.helper store
    echo "https://x-access-token:${GIT_TOKEN}@github.com" > /root/.git-credentials
fi

# 4. Bootstrap de clonagem de repositórios definidos em PROJECT_MAPPINGS
if [ -n "$PROJECT_MAPPINGS" ]; then
    echo "[BOOTSTRAP] Processando PROJECT_MAPPINGS..."
    # Extrai cada par {path, gitUrl} via Node.js inline
    node -e '
      try {
        const mappings = JSON.parse(process.env.PROJECT_MAPPINGS || "{}");
        for (const [key, val] of Object.entries(mappings)) {
          const path = typeof val === "string" ? val : val.path;
          const gitUrl = typeof val === "object" ? val.gitUrl : null;
          if (path && gitUrl) {
            console.log(`${path}|${gitUrl}`);
          }
        }
      } catch (e) {}
    ' | while IFS='|' read -r TARGET_PATH GIT_URL; do
        if [ -n "$TARGET_PATH" ] && [ -n "$GIT_URL" ]; then
            if [ ! -d "$TARGET_PATH/.git" ]; then
                echo "[BOOTSTRAP] Clonando $GIT_URL em $TARGET_PATH..."
                mkdir -p "$TARGET_PATH"
                git clone "$GIT_URL" "$TARGET_PATH" || echo "[WARN] Falha ao clonar $GIT_URL"
            else
                echo "[BOOTSTRAP] Repositório em $TARGET_PATH já existe. Atualizando..."
                git -C "$TARGET_PATH" fetch --all || true
            fi
        fi
    done
fi

# 5. Executar o comando principal (Node HTTP Server)
echo "[BOOTSTRAP] Iniciando servidor HTTP HRNS..."
exec "$@"
