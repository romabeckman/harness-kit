# Project Architecture Mapping and Feature Implementation Prompt

You are an expert software architect and developer. Your task is to analyze a project's architecture and implement new features following the project's established patterns and conventions.

## Phase 1: Project Discovery and Analysis

### Step 1: Analyze Project Structure
First, examine the provided codebase to understand:

**Architecture Pattern:**
- What architectural pattern does this project follow? (Clean Architecture, Hexagonal, Layered, MVC, etc.)
- How are concerns separated? (presentation, business logic, data access)
- What design principles are being applied? (SOLID, DRY, etc.)

**Directory Organization:**
- Map out the complete directory structure
- Identify how features/modules are organized
- Determine naming conventions used throughout the project
- Find configuration and shared utility locations

**Technology Stack:**
- What programming language and framework is used?
- What libraries and dependencies are present?
- What patterns for dependency injection, validation, etc. are used?

**Code Patterns:**
- How are input/output models defined?
- What base classes or interfaces exist?
- How is error handling implemented?
- What logging patterns are used?
- How are routes/controllers structured?

### Step 2: Extract Implementation Template
Based on your analysis, create a project-specific implementation guide that includes:

**File Structure Pattern:**
```
Identify and document the exact directory structure pattern used for features:
- Where do new features go?
- What files are required for each feature?
- What naming conventions are used?
- What package/module initialization is needed?
```

**Code Templates:**
- Input model template with project's validation patterns
- Output model template with project's response patterns  
- Handler/service template with project's base classes
- Route/controller template with project's routing patterns
- Configuration patterns used in the project

**Integration Points:**
- How are new routes registered?
- How is dependency injection configured?
- Where are shared utilities located?
- How is documentation generated/updated?

## Phase 2: Feature Implementation

### Step 3: Requirement Analysis
When given a feature request:

**Extract Requirements:**
- Feature name and scope
- Specific use case or operation
- Input requirements and validation rules
- Output format and data structure
- Business logic and processing steps
- External dependencies or integrations needed

**Map to Project Structure:**
- Determine where this feature fits in the existing architecture
- Identify what existing patterns/components can be reused
- Plan the implementation following project conventions

### Step 4: Implementation Planning
Create a step-by-step implementation plan:

**Files to Create/Modify:**
- List exact file paths following project structure
- Specify what goes in each file based on project patterns
- Identify any configuration updates needed
- Plan integration points with existing code

**Dependencies and Integration:**
- What existing services/utilities will be used?
- What new dependencies might be needed?
- How will this integrate with existing features?
- What testing approach should be followed?

## Phase 3: Code Generation

### Step 5: Generate Implementation
Provide complete, working code that:

**Follows Project Patterns:**
- Uses exact same coding style and conventions
- Implements same error handling patterns
- Follows same validation and serialization approaches
- Uses same logging and configuration patterns

**Maintains Architecture:**
- Respects separation of concerns established in project
- Uses same dependency injection patterns
- Follows same naming and organization conventions
- Integrates properly with existing infrastructure

**Includes Integration:**
- Updates all necessary configuration files
- Registers new components properly
- Follows project's documentation patterns
- Includes any necessary migration or setup steps

## Prompt Instructions

When I provide you with a codebase and a feature request:

1. **First, analyze the project** following Phase 1 steps and provide a summary of:
   - Architecture pattern and organization
   - Key conventions and patterns
   - Technology stack and dependencies
   - Implementation template for this specific project

2. **Then, plan the implementation** following Phase 2 steps:
   - Break down the feature requirements
   - Map to project structure
   - Create detailed implementation plan

3. **Finally, generate the code** following Phase 3:
   - Provide complete, working implementation
   - Follow all project patterns exactly
   - Include all necessary integration steps
   - Ensure consistency with existing codebase

## Analysis Framework

Use this framework to systematically analyze any project:

**Structure Analysis:**
```
📁 Project Root
├── 📁 [Identify main application directory]
├── 📁 [Identify feature/module organization]
├── 📁 [Identify shared/common code location]
├── 📁 [Identify configuration location]
├── 📁 [Identify API/interface layer]
└── 📁 [Identify other significant directories]
```

**Pattern Recognition:**
- How are classes/functions named?
- What inheritance/composition patterns exist?
- How is configuration managed?
- What validation/serialization is used?
- How are errors handled and logged?
- What testing patterns are present?

**Integration Points:**
- How are new components registered?
- What dependency injection is used?
- How is routing/endpoint registration handled?
- What documentation generation exists?

## Output Requirements

### Document Format
Your response must be structured as a complete documentation file that will be saved as:

**File:** `./docs/ARCHITECTURE.md`

**Language:** Portuguese (Brazil)

**Structure:** The document must include all sections below written in Portuguese

### Output Format

Structure your response as a complete markdown document with the following sections:

```markdown
# Arquitetura do Projeto

## 🔍 Análise da Arquitetura

### Padrão Arquitetural
[Análise detalhada da arquitetura, padrões e convenções em português]

### Estrutura de Diretórios
[Mapeamento completo da estrutura do projeto]

### Stack Tecnológico
[Tecnologias, frameworks e bibliotecas utilizadas]

### Padrões de Código
[Convenções de nomenclatura, estruturas de classes, etc.]

## 📋 Guia de Implementação

### Estrutura de Features
[Como implementar novas funcionalidades seguindo os padrões do projeto]

### Templates de Código
[Templates específicos para este projeto]

### Pontos de Integração
[Como integrar novos componentes ao projeto existente]

## 💻 Exemplo de Implementação

### Estrutura de Arquivos
[Exemplo prático de implementação de uma feature]

### Código de Exemplo
[Exemplos de código seguindo os padrões do projeto]

## 🔧 Instruções de Integração

### Passos de Configuração
[Passos necessários para integrar novas funcionalidades]

### Checklist de Implementação
[Lista de verificação para garantir conformidade com o projeto]

## 📚 Referências e Convenções

### Boas Práticas
[Práticas recomendadas específicas para este projeto]

### Padrões de Nomenclatura
[Convenções de nomes utilizadas no projeto]

### Tratamento de Erros
[Como implementar tratamento de erros seguindo o padrão do projeto]
```

## Important Notes

- **All content must be written in Portuguese (Brazil)**
- **The document must be complete and self-contained**
- **Include specific examples from the analyzed project**
- **Provide actionable implementation guidance**
- **Follow markdown formatting standards**
- **The document should serve as the definitive architecture guide for the project**

---

**Remember:** Every project is unique. Your job is to understand THIS specific project's patterns and create comprehensive Portuguese documentation that enables developers to implement features that feel native to the existing codebase.