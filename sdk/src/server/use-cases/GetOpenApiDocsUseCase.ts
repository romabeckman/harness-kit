import { OpenApiSpecGenerator } from '../docs/OpenApiSpecGenerator'
import type { OpenApiSpec } from '../types'

export class GetOpenApiDocsUseCase {
  getSpec(): OpenApiSpec {
    return OpenApiSpecGenerator.getSpec()
  }

  getSwaggerHtml(): string {
    return OpenApiSpecGenerator.getSwaggerHtml()
  }
}
