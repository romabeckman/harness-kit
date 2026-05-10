# Design Spec: Superpowers Prerequisite in README

**Date:** 2026-05-10
**Topic:** Adding mandatory Superpowers installation prerequisite to README.md

## Overview
Inform users that installing the Superpowers repository is a mandatory requirement for the LLM Agent Suite to function correctly.

## Proposed Changes

### File: `README.md`

#### Section: `## 🛠️ Instalação e Configuração`

1.  **Insert New Subsection:** Add `### 0. Pré-requisito Obrigatório ⚠️` at the beginning of the "Instalação e Configuração" section.
2.  **Content:**
    *   State that Superpowers is mandatory.
    *   Provide the link: `https://github.com/obra/superpowers`.
    *   Add an importance alert explaining why it's needed (access to TDD, DDD, Debugging automation).
3.  **Renumber Existing Subsections:**
    *   `### 1. Claude Code CLI` (was 1)
    *   `### 2. Cursor (IDE & CLI)` (was 2)
    *   `### 3. Google Gemini CLI` (was 3)

## Verification Plan
*   Verify that the link to Superpowers is correct and clickable.
*   Verify that the numbering of subsequent sections is consistent.
*   Verify that the visual hierarchy is maintained.
