module.exports = {
  extends: ['@xobotyi/eslint-config/typescript'],
  parserOptions: {
    project: './tsconfig.json',
  },
  rules: {
    'no-empty': 'off',

    '@typescript-eslint/adjacent-overload-signatures': ['warn'],
    '@typescript-eslint/method-signature-style': ['warn', 'property'],
    '@typescript-eslint/explicit-module-boundary-types': [
      'warn',
      { allowArgumentsExplicitlyTypedAsAny: true, allowDirectConstAssertionInArrowFunctions: true },
    ],
  },
  ignorePatterns: ['dist'],
};
