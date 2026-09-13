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

  protected override async inspect(page: any, _scenario: QaScenario): Promise<Array<{ type: string; passed: boolean; message: string }>> {
    const violations = await page.evaluate(auditAccessibility) as AccessibilityViolation[]
    return violations.length === 0
      ? [{ type: 'accessibility', passed: true, message: 'No deterministic accessibility violations found' }]
      : violations.map((violation) => ({
          type: 'accessibility',
          passed: false,
          message: `${violation.rule}: ${violation.selector}`,
        }))
  }
}

function auditAccessibility(): AccessibilityViolation[] {
  const violations: AccessibilityViolation[] = []
  const documentRef = (globalThis as any).document
  const css = (globalThis as any).CSS
  const selector = (element: any): string => element.id ? `#${element.id}` : element.tagName.toLowerCase()
  for (const image of documentRef.querySelectorAll('img:not([alt])')) violations.push({ rule: 'image-alt', selector: selector(image) })
  for (const input of documentRef.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
    const id = input.getAttribute('id')
    const escapedId = id && typeof css?.escape === 'function' ? css.escape(id) : id
    const labelled = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || (escapedId && documentRef.querySelector(`label[for="${escapedId}"]`))
    if (!labelled) violations.push({ rule: 'form-label', selector: selector(input) })
  }
  if (!documentRef.documentElement.lang) violations.push({ rule: 'html-lang', selector: 'html' })
  return violations
}
