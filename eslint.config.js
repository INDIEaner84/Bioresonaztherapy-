import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        ImageData: 'readonly',
        Float32Array: 'readonly',
        WebSocket: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        indexedDB: 'readonly',
        queueMicrotask: 'readonly',
        setImmediate: 'readonly',
        URLSearchParams: 'readonly',
        location: 'readonly',
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-undef': 'warn'
    },
    ignores: ['dashboard/**', 'csharp/**', 'src/**', 'presets/**', 'experiments/**', 'node_modules/**', 'dist/**']
  }
];
