import {defineConfig} from 'vite-plus';
import javascript from '@ver0/oxlint-config/javascript.js';
import typescript from '@ver0/oxlint-config/typescript.js';
import node from '@ver0/oxlint-config/node.js';
import vitest from '@ver0/oxlint-config/vitest.js';

export default defineConfig({
	fmt: {
		printWidth: 120,
		useTabs: true,
		tabWidth: 2,
		semi: true,
		singleQuote: true,
		trailingComma: 'all',
		bracketSpacing: false,
	},
	lint: {
		extends: [
			javascript,
			typescript,
			node,
			vitest,
			{
				overrides: [
					{
						files: ['**/*.test.*'],
						plugins: ['vitest'],
						rules: {
							'vitest/expect-expect': 'off',
							'vitest/no-conditional-expect': 'off',
							'vitest/no-conditional-in-test': 'off',
							'vitest/no-conditional-tests': 'off',
							'vitest/no-identical-title': 'off',
							'vitest/require-mock-type-parameters': 'off',
							'vitest/valid-title': 'off',
						},
					},
				],
			},
		],
		ignorePatterns: ['dist/**', 'coverage/**'],
		rules: {
			'eslint/no-await-in-loop': 'off',
			'eslint/no-new': 'off',
			'eslint/no-promise-executor-return': 'off',
			'eslint/no-redeclare': 'off',
			'promise/always-return': 'off',
			'promise/catch-or-return': 'off',
			'promise/prefer-await-to-then': 'off',
			'typescript/consistent-type-assertions': 'off',
			'typescript/dot-notation': 'off',
			'typescript/no-confusing-void-expression': 'off',
			'typescript/no-deprecated': 'off',
			'typescript/no-floating-promises': 'off',
			'typescript/no-restricted-types': 'off',
			'typescript/no-unsafe-argument': 'off',
			'typescript/no-unsafe-assignment': 'off',
			'typescript/no-unsafe-call': 'off',
			'typescript/no-unsafe-member-access': 'off',
			'typescript/no-unsafe-return': 'off',
			'typescript/no-unsafe-type-assertion': 'off',
			'typescript/prefer-readonly-parameter-types': 'off',
			'typescript/strict-boolean-expressions': 'off',
			'typescript/strict-void-return': 'off',
			'typescript/unbound-method': 'off',
			'typescript/use-unknown-in-catch-callback-variable': 'off',
			'unicorn/filename-case': 'off',
			'unicorn/prefer-event-target': 'off',
			// conflicts with require-await: an async function without await must return a promise
			'unicorn/no-useless-promise-resolve-reject': 'off',
		},
	},
	test: {
		dir: 'test',
		coverage: {
			include: ['src/**/*.ts'],
			reporter: ['text', 'lcov'],
		},
	},
});
