import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './docs/openapi.json',
  output: {
    path: './src/api',
  },
  parser: {
    patch: {
      operations: (_method, _path, operation) => {
        (operation as Record<string, unknown>).operationId = undefined;
      },
    },
  },
  plugins: [
    {
      name: '@hey-api/client-axios',
      runtimeConfigPath: './src/lib/api-client',
      baseUrl: false,
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
    '@tanstack/react-query',
  ],
});
