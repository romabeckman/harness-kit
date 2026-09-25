import { PlaywrightDriver, type PlaywrightLoader } from './PlaywrightDriver'
import type { QaScenario } from '../types'

interface AccessibilityViolation {
  rule: string
  selector: string
}

export class AccessibilityDriver extends PlaywrightDriver {
  constructor(loader?: PlaywrightLoader) {
    super('accessibility', loader)
  }

  protected override async inspect(page: any, scenario: QaScenario, signal?: AbortSignal): Promise<Array<{ type: string; passed: boolean; message: string }>> {
    const violations = await page.evaluate(auditAccessibility) as AccessibilityViolation[]
    const audit = violations.length === 0
      ? [{ type: 'accessibility', passed: true, message: 'No deterministic accessibility violations found' }]
      : violations.map((violation) => ({
          type: 'accessibility',
          passed: false,
          message: `${violation.rule}: ${violation.selector}`,
        }))
    return scenario.assertions?.length ? [...audit, ...await super.inspect(page, scenario, signal)] : audit
  }
}

export function auditAccessibility(documentRef = (globalThis as any).document, css = (globalThis as any).CSS): AccessibilityViolation[] {
  const violations: AccessibilityViolation[] = []
  const selector = (element: any): string => element.id ? `#${element.id}` : element.tagName.toLowerCase()
  for (const image of documentRef.querySelectorAll('img:not([alt])')) violations.push({ rule: 'image-alt', selector: selector(image) })
  for (const input of documentRef.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
    const id = input.getAttribute('id')
    const escapedId = id && typeof css?.escape === 'function' ? css.escape(id) : id
    const labelledBy = input.getAttribute('aria-labelledby')?.trim().split(/\s+/).filter(Boolean) ?? []
    const labelledByNames = labelledBy.length > 0 && labelledBy.some((id: string) => {
      const referenced = documentRef.getElementById(id)
      return referenced && String(referenced.textContent ?? '').trim().length > 0
    })
    const labels = Array.from(input.labels ?? []) as Array<{ textContent?: string }>
    const labelledByLabel = escapedId ? documentRef.querySelector(`label[for="${escapedId}"]`) : null
    const hasLabelText = labels.some((label) => String(label.textContent ?? '').trim().length > 0)
      || Boolean(labelledByLabel && String(labelledByLabel.textContent ?? '').trim())
    const type = String(input.getAttribute('type') ?? 'text').toLowerCase()
    const intrinsicName = (type === 'submit' || type === 'reset')
      || (type === 'button' && String(input.value ?? '').trim().length > 0)
      || (type === 'image' && Boolean(input.getAttribute('alt')?.trim()))
    const labelled = input.getAttribute('aria-label')?.trim() || labelledByNames || hasLabelText || intrinsicName
    if (!labelled) violations.push({ rule: 'form-label', selector: selector(input) })
  }
  if (!documentRef.documentElement.lang) violations.push({ rule: 'html-lang', selector: 'html' })
  return violations
}
