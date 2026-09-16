import {describe, expect, it} from 'vite-plus/test';
import {
	validateBound,
	validateDelay,
	validateJobId,
	validatePriority,
	validateTimeout,
	validateTTR,
	validateTubeName,
} from '../../src/util/validator.js';
import {
	BOUND_MAX,
	BOUND_MIN,
	DELAY_MAX,
	DELAY_MIN,
	JOB_ID_MIN,
	PRIORITY_MAX,
	PRIORITY_MIN,
	TIMEOUT_MAX,
	TIMEOUT_MIN,
	TTR_MAX,
	TTR_MIN,
} from '../../src/const.js';

describe('validator', () => {
	function itValidates(
		validate: (value: never) => void,
		tableTests: Array<{name: string; in: unknown; out: Error | undefined}>,
	): void {
		it.each(tableTests.filter((test) => test.out === undefined))('$name', (test) => {
			expect(() => {
				validate(test.in as never);
			}).not.toThrow();
		});

		it.each(tableTests.filter((test) => test.out instanceof Error))('$name', (test) => {
			expect(() => {
				validate(test.in as never);
			}).toThrow(test.out);
		});
	}

	describe('validateTubeName', () => {
		const tableTests = [
			{
				name: 'valid tube name',
				in: 'some-tube-name',
				out: undefined,
			},
			{
				name: 'non-string tube name',
				in: 123,
				out: new TypeError(`tube name should be a string, got number`),
			},
			{
				name: 'tube name with invalid characters',
				in: 'invalid tube name',
				out: new TypeError(`tube name should satisfy regexp: /^[A-Za-z0-9+/;.$_()][A-Za-z0-9\\-+/;.$_()]{0,199}$/`),
			},
			{
				name: 'too long tube name',
				in:
					'Lorem_ipsum_dolor_sit_amet_consectetur_adipiscing_elitsed_do_eiusmod_tempor' +
					'_incididunt_ut_labore_et_dolore_magna_aliqua_Ut_enim_ad_minim_veniam_quis_' +
					'nostrud_exercitation_ullamco_laboris_nisi_ut_aliquip',
				out: new TypeError(`tube name should satisfy regexp: /^[A-Za-z0-9+/;.$_()][A-Za-z0-9\\-+/;.$_()]{0,199}$/`),
			},
			{
				name: 'tube name starting with a hyphen',
				in: '-tube',
				out: new TypeError(`tube name should satisfy regexp: /^[A-Za-z0-9+/;.$_()][A-Za-z0-9\\-+/;.$_()]{0,199}$/`),
			},
			{
				name: 'tube name with a hyphen inside',
				in: 'tube-name',
				out: undefined,
			},
			{
				name: 'too short tube name',
				in: '',
				out: new TypeError(`tube name should satisfy regexp: /^[A-Za-z0-9+/;.$_()][A-Za-z0-9\\-+/;.$_()]{0,199}$/`),
			},
		];

		itValidates(validateTubeName, tableTests);
	});

	describe('validatePriority', () => {
		const tableTests = [
			{
				name: 'valid priority',
				in: 5,
				out: undefined,
			},
			{
				name: 'valid minimum priority',
				in: PRIORITY_MIN,
				out: undefined,
			},
			{
				name: 'valid maximum priority',
				in: PRIORITY_MAX,
				out: undefined,
			},
			{
				name: 'priority below minimal',
				in: PRIORITY_MIN - 1,
				out: new TypeError(`priority should be >= ${PRIORITY_MIN}`),
			},
			{
				name: 'priority above maximal',
				in: PRIORITY_MAX + 1,
				out: new TypeError(`priority should be <= ${PRIORITY_MAX}`),
			},
			{
				name: 'non-number priority',
				in: '123',
				out: new TypeError(`priority should be a number, got string`),
			},
		];

		itValidates(validatePriority, tableTests);
	});

	describe('validateDelay', () => {
		const tableTests = [
			{
				name: 'valid delay',
				in: 5,
				out: undefined,
			},
			{
				name: 'valid minimum delay',
				in: DELAY_MIN,
				out: undefined,
			},
			{
				name: 'valid maximum delay',
				in: DELAY_MAX,
				out: undefined,
			},
			{
				name: 'delay below minimal',
				in: DELAY_MIN - 1,
				out: new TypeError(`delay should be >= ${DELAY_MIN}`),
			},
			{
				name: 'delay above maximal',
				in: DELAY_MAX + 1,
				out: new TypeError(`delay should be <= ${DELAY_MAX}`),
			},
			{
				name: 'non-number delay',
				in: '123',
				out: new TypeError(`delay should be a number, got string`),
			},
		];

		itValidates(validateDelay, tableTests);
	});

	describe('validateTTR', () => {
		const tableTests = [
			{
				name: 'valid TTR',
				in: 5,
				out: undefined,
			},
			{
				name: 'valid minimum TTR',
				in: TTR_MIN,
				out: undefined,
			},
			{
				name: 'valid maximum TTR',
				in: TTR_MAX,
				out: undefined,
			},
			{
				name: 'TTR below minimal',
				in: TTR_MIN - 1,
				out: new TypeError(`ttr should be >= ${TTR_MIN}`),
			},
			{
				name: 'TTR above maximal',
				in: TTR_MAX + 1,
				out: new TypeError(`ttr should be <= ${TTR_MAX}`),
			},
			{
				name: 'non-number TTR',
				in: '123',
				out: new TypeError(`ttr should be a number, got string`),
			},
		];

		itValidates(validateTTR, tableTests);
	});

	describe('validateTimeout', () => {
		const tableTests = [
			{
				name: 'valid timeout',
				in: 5,
				out: undefined,
			},
			{
				name: 'valid minimum timeout',
				in: TIMEOUT_MIN,
				out: undefined,
			},
			{
				name: 'valid maximum timeout',
				in: TIMEOUT_MAX,
				out: undefined,
			},
			{
				name: 'timeout below minimal',
				in: TIMEOUT_MIN - 1,
				out: new TypeError(`timeout should be >= ${TIMEOUT_MIN}`),
			},
			{
				name: 'timeout above maximal',
				in: TIMEOUT_MAX + 1,
				out: new TypeError(`timeout should be <= ${TIMEOUT_MAX}`),
			},
			{
				name: 'fractional timeout',
				in: 1.5,
				out: new TypeError(`timeout should be an integer, got 1.5`),
			},
			{
				name: 'non-number timeout',
				in: '123',
				out: new TypeError(`timeout should be a number, got string`),
			},
		];

		itValidates(validateTimeout, tableTests);
	});

	describe('validateBound', () => {
		const tableTests = [
			{
				name: 'valid bound',
				in: 5,
				out: undefined,
			},
			{
				name: 'valid minimum bound',
				in: BOUND_MIN,
				out: undefined,
			},
			{
				name: 'valid maximum bound',
				in: BOUND_MAX,
				out: undefined,
			},
			{
				name: 'bound below minimal',
				in: BOUND_MIN - 1,
				out: new TypeError(`bound should be >= ${BOUND_MIN}`),
			},
			{
				name: 'bound above maximal',
				in: BOUND_MAX + 1,
				out: new TypeError(`bound should be <= ${BOUND_MAX}`),
			},
			{
				name: 'fractional bound',
				in: 1.5,
				out: new TypeError(`bound should be an integer, got 1.5`),
			},
			{
				name: 'non-number bound',
				in: '123',
				out: new TypeError(`bound should be a number, got string`),
			},
		];

		itValidates(validateBound, tableTests);
	});

	describe('validateJobId', () => {
		const tableTests = [
			{
				name: 'valid job id',
				in: 5,
				out: undefined,
			},
			{
				name: 'valid minimum job id',
				in: JOB_ID_MIN,
				out: undefined,
			},
			{
				name: 'job id below minimal',
				in: JOB_ID_MIN - 1,
				out: new TypeError(`job id should be >= ${JOB_ID_MIN}`),
			},
			{
				name: 'NaN job id',
				in: Number.NaN,
				out: new TypeError(`job id should be an integer, got NaN`),
			},
			{
				name: 'fractional job id',
				in: 1.5,
				out: new TypeError(`job id should be an integer, got 1.5`),
			},
			{
				name: 'non-number priority',
				in: '123',
				out: new TypeError(`job id should be a number, got string`),
			},
		];

		itValidates(validateJobId, tableTests);
	});
});
