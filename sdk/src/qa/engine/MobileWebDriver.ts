import { PlaywrightDriver, type PlaywrightLoader } from './PlaywrightDriver'

export class MobileWebDriver extends PlaywrightDriver {
  constructor(loader?: PlaywrightLoader) {
    super('mobile-web', loader)
  }

  protected override pageOptions(): Record<string, unknown> {
    return {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    }
  }
}
