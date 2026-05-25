# Implementação de Score Thresholds Configuráveis

**Data:** 25 de maio de 2026

## Resumo das Mudanças

Foram realizados ajustes pontuais em `/home/rbeckman/Projetos/ia/harness-kit/skills/autonomous-orchestrator/SKILL.md` para permitir que o usuário forneça scores configuráveis para validação de features.

## Alterações Realizadas

### 1. BOOTSTRAP - Etapa 3: Score Thresholds Acquisition

**Adicionado:** Nova etapa que coleta do usuário os thresholds de validação:
- `the-grumpy-tech-lead` score >= 0.80 (default)
- `adversarial-qa` score >= 0.70 (default)

Estes valores são armazenados como:
- `${scoreThresholdTL}` = threshold para tech-lead
- `${scoreThresholdAdv}` = threshold para adversarial-qa

### 2. Arquivo de Persistência: BOOTSTRAP-CONFIG.md

**Novo arquivo criado automaticamente durante BOOTSTRAP:**
- `docs/product/BOOTSTRAP-CONFIG.md`

Propósito: Armazenar os score thresholds para reutilização em re-entries.

Estrutura:
```markdown
| Skill | Threshold | User Provided |
| --- | --- | --- |
| `the-grumpy-tech-lead` | 0.80 | No (using default) |
| `adversarial-qa` | 0.70 | No (using default) |
```

### 3. Phase C: Validation & Decision Gate

**Adicionado:** Etapa "Load Score Thresholds" (item 1)
- Em re-entries, o orchestrator carrega os valores de `BOOTSTRAP-CONFIG.md`
- Garante consistência de validação entre sessões

**Atualizado:** Lógica de PASS/RETRY usa variáveis dinâmicas
- **PASS:** If `Score A >= ${scoreThresholdTL}` AND `Score B >= ${scoreThresholdAdv}`
- **RETRY:** If (`Score A < ${scoreThresholdTL}` OR `Score B < ${scoreThresholdAdv}`)

### 4. COMPLETION-CRITERIA.md (no exemplo)

**Atualizado:** Exemplo de template para refletir valores dinâmicos
```markdown
* `the-grumpy-tech-lead` score >= ${scoreThresholdTL} (configured during BOOTSTRAP)
* `adversarial-qa` score >= ${scoreThresholdAdv} (configured during BOOTSTRAP)
```

## Fluxo de Execução

```
BOOTSTRAP
  ├─ 1. Scope Acquisition (se necessário)
  ├─ 2. Project Paths Acquisition (se necessário)
  ├─ 3. Score Thresholds Acquisition ✨ NEW
  │   ├─ Pergunta: `the-grumpy-tech-lead` score threshold (default: 0.80)?
  │   ├─ Pergunta: `adversarial-qa` score threshold (default: 0.70)?
  │   └─ Armazena em ${scoreThresholdTL} e ${scoreThresholdAdv}
  ├─ 4. Synthesis (geração de BACKLOG.md)
  └─ 5. File Creation
      ├─ BACKLOG.md
      ├─ COMPLETION-CRITERIA.md
      ├─ DEVELOPMENT-STATE.md
      ├─ DECISIONS.md
      └─ BOOTSTRAP-CONFIG.md ✨ NEW (persistência)

PHASE C - Validation & Decision Gate
  └─ 1. Load Score Thresholds ✨ NEW (lê de BOOTSTRAP-CONFIG.md em re-entry)
     └─ Usa ${scoreThresholdTL} e ${scoreThresholdAdv} nas comparações
```

## Re-entry Behavior

Quando o orchestrator for reinicializado após uma pausa:
1. Verifica se `BOOTSTRAP-CONFIG.md` existe
2. Carrega `${scoreThresholdTL}` e `${scoreThresholdAdv}` da config
3. Continua validação com os mesmos thresholds da sessão anterior
4. Garante consistência sem re-questionar o usuário

## Valores Padrão

| Skill | Default | Mínimo | Máximo |
| --- | --- | --- | --- |
| `the-grumpy-tech-lead` | 0.80 | 0.00 | 1.00 |
| `adversarial-qa` | 0.70 | 0.00 | 1.00 |

## Impacto nos Skills

### the-grumpy-tech-lead

- Agora recebe os contextos dinâmicos durante invocação
- Seu score será comparado com `${scoreThresholdTL}` em Phase C
- A lógica de PASS/RETRY em autonomous-orchestrator usa este threshold

### adversarial-qa

- Agora recebe os contextos dinâmicos durante invocação
- Seu score será comparado com `${scoreThresholdAdv}` em Phase C
- A lógica de PASS/RETRY em autonomous-orchestrator usa este threshold

## Verificação

Para validar a implementação, consulte:
1. [skills/autonomous-orchestrator/SKILL.md](./skills/autonomous-orchestrator/SKILL.md) - seção "1. BOOTSTRAP" (linhas 32-51)
2. [skills/autonomous-orchestrator/SKILL.md](./skills/autonomous-orchestrator/SKILL.md) - seção "Phase C" (linhas 68-112)
3. [skills/autonomous-orchestrator/SKILL.md](./skills/autonomous-orchestrator/SKILL.md) - exemplo "BOOTSTRAP-CONFIG.md" (linhas 172-182)

---

**Status:** ✅ Implementação Concluída
**Testado em:** N/A (requer invocação real do orchestrator)
**Próximas Ações:** Invocar autonomous-orchestrator em Autonomous Mode para testar BOOTSTRAP interativo
