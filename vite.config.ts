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
		extends: [javascript, typescript, node, vitest],
		ignorePatterns: ['dist/**', 'coverage/**'],
		rules: {
			// tests reach private methods through `c['method']`; dot notation would be a compile error
			'typescript/dot-notation': 'off',
			'typescript/no-restricted-types': 'off',
			'typescript/no-unsafe-argument': 'off',
			'typescript/no-unsafe-assignment': 'off',
			'typescript/no-unsafe-call': 'off',
			'typescript/no-unsafe-member-access': 'off',
			'typescript/no-unsafe-return': 'off',
			'typescript/no-unsafe-type-assertion': 'off',
			'typescript/prefer-readonly-parameter-types': 'off',
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
