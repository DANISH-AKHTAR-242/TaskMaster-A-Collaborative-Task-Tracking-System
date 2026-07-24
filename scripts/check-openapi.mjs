import SwaggerParser from '@apidevtools/swagger-parser';
import { fileURLToPath } from 'node:url';
try {
  await SwaggerParser.validate(fileURLToPath(new URL('../openapi.yaml', import.meta.url)));
  console.log('OpenAPI document is valid');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
