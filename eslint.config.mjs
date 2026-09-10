import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  { ignores: ['.next/**', 'next-env.d.ts', 'node_modules/**', 'public/**', 'vendor/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  { files: ['lib/digital-human/use-avatar.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
];
export default config;
