const defaultExtends = [
  'airbnb-typescript/base',
  'eslint:recommended',
  'plugin:jest/recommended',
  'plugin:@typescript-eslint/eslint-recommended',
  'plugin:@typescript-eslint/recommended',
  'plugin:@typescript-eslint/recommended-requiring-type-checking',
  'prettier',
];

const defaultRules = {
  '@typescript-eslint/no-use-before-define': 'off',
  'import/prefer-default-export': 'off',
  'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
  'import/extensions': [
    'error',
    'ignorePackages',
    {
      js: 'never',
      ts: 'never',
    },
  ],
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
};

module.exports = {
  ignorePatterns: ['.eslintrc.js'],
  parser: '@typescript-eslint/parser',
  plugins: ['import', 'jest', 'prettier'],
  extends: defaultExtends,
  rules: defaultRules,
  overrides: [
    {
      files: '*.[tj]s',
      parserOptions: { project: './tsconfig.json' },
      rules: {
        ...defaultRules,
        '@typescript-eslint/indent': 'off',
      },
    },
    {
      files: '*.test.ts',
      parserOptions: { project: './tsconfig.json' },
      rules: {
        ...defaultRules,
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: 'infrastructure/**/*.ts',
      rules: {
        'no-new': 'off',
      },
    },
  ],
  env: {
    jest: true,
    node: true,
    es2021: true,
  },
};
