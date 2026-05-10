# Diretrizes para o docs/README.md

Este documento define as regras estritas de formatação e manutenção do arquivo `docs/README.md` (ou README principal de documentação do projeto). Este arquivo atua como o **hub central e índice** de toda a documentação técnica.

## Regras de Estrutura e Formatação

1. **Estrutura Fixa:** O documento deve conter invariavelmente um cabeçalho descritivo, uma tabela de "Índice de Documentação" e uma lista numerada de "Ordem de Leitura Recomendada".
2. **Tabela de Índice:** A seção `## Índice de Documentação` deve conter uma tabela com exatamente três colunas:
   - `Documento`: O nome do arquivo com um link relativo (ex: `[**ARCHITECTURE.md**](./ARCHITECTURE.md)`).
   - `Descrição`: Um resumo claro e objetivo (máximo de 2 frases) do conteúdo do arquivo.
   - `Leitura`: Classificação obrigatória entre **`Obrigatória`** (em negrito, para documentos estruturais e arquiteturais, como testes e arquitetura) ou `Opcional` (para guias específicos de features, integrações ou ferramentas).
3. **Ordem de Leitura Recomendada:** A seção final deve sugerir um caminho lógico de aprendizado em uma lista numerada. 
   - Documentos fundacionais (ex: Arquitetura, Organização de Pastas) devem ser os primeiros (1).
   - Documentos de regras core/negócio em seguida (2).
   - Documentos de processo/testes (3).
   - Ferramentas auxiliares por último.
4. **Atualização do Índice:** Sempre que um novo documento for adicionado à pasta `docs/`, ele DEVE ser inserido na tabela deste README, recebendo sua devida classificação e descrição. Nunca remova documentos existentes da tabela a menos que o arquivo correspondente tenha sido deletado.

## Template Obrigatório

Sempre utilize a estrutura exata abaixo ao gerar ou atualizar o arquivo `docs/README.md`:

```markdown
# Documentação do Projeto

Este diretório contém a documentação técnica detalhada do projeto **[Nome do Projeto/Serviço]**. Este sumário serve como guia para desenvolvedores e agentes de IA compreenderem a estrutura, arquitetura e funcionalidades do sistema.

## Índice de Documentação

Abaixo estão listados todos os documentos disponíveis, com uma breve descrição e a indicação de leitura.

| Documento | Descrição | Leitura |
|-----------|-----------|---------|
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | Definição da arquitetura, estrutura de pastas, camadas e padrões de código do projeto. | **Obrigatória** |
| [**TESTS.md**](./TESTS.md) | Guia completo sobre estratégias de teste, padrões e comandos de execução. | **Obrigatória** |
| [**[NOVO_DOCUMENTO].md**](./[NOVO_DOCUMENTO].md) | [Descrição concisa e clara de uma linha sobre o arquivo]. | Opcional |

## Ordem de Leitura Recomendada

Para um entendimento completo do sistema, recomenda-se a seguinte ordem de leitura:

1. **ARCHITECTURE.md**: Para entender a fundação técnica, organização de pastas e padrões de código.
2. **[Documento Core/Negócio]**: Para entender o que o sistema faz e seus principais componentes (se aplicável).
3. **TESTS.md**: Para entender as ferramentas e estratégias de validação da aplicação.
4. Demais documentos conforme a necessidade específica da tarefa.