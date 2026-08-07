import { OpenApiSpecGenerator } from '../../adapters/inbound/http/docs/OpenApiSpecGenerator'
import type { OpenApiSpec } from '../../domain/types'

export class GetOpenApiDocsUseCase {
  getSpec(): OpenApiSpec {
    return OpenApiSpecGenerator.getSpec()
  }

  getSwaggerHtml(): string {
    return OpenApiSpecGenerator.getSwaggerHtml()
  }
}
