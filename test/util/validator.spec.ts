/* eslint-disable @typescript-eslint/no-loop-func,no-restricted-syntax */
import {
  validateDelay,
  validateJobId,
  validatePriority,
  validateTimeout,
  validateTTR,
  validateTubeName,
} from '../../src/util/validator';
import {
  DELAY_MAX,
  DELAY_MIN,
  JOB_ID_MIN,
  PRIORITY_MAX,
  PRIORITY_MIN,
  TIMEOUT_MIN,
  TTR_MAX,
  TTR_MIN,
} from '../../src/const';

describe('validator', () => {
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
        out: new TypeError(`tube name should satisfy regexp: /^[A-Za-z0-9\\-+/;.$_()]{1,200}$/`),
      },
      {
        name: 'too long tube name',
        in:
          'Lorem_ipsum_dolor_sit_amet_consectetur_adipiscing_elitsed_do_eiusmod_tempor' +
          '_incididunt_ut_labore_et_dolore_magna_aliqua_Ut_enim_ad_minim_veniam_quis_' +
          'nostrud_exercitation_ullamco_laboris_nisi_ut_aliquip',
        out: new TypeError(`tube name should satisfy regexp: /^[A-Za-z0-9\\-+/;.$_()]{1,200}$/`),
      },
      {
        name: 'too short tube name',
        in: '',
        out: new TypeError(`tube name should satisfy regexp: /^[A-Za-z0-9\\-+/;.$_()]{1,200}$/`),
      },
    ];

    for (const test of tableTests) {
      if (test.out instanceof Error) {
        it(test.name, () => {
          expect(() => {
            // @ts-expect-error we're testing invalid inputs
            validateTubeName(test.in);
          }).toThrowError(test.out);
        });
      } else {
        it(test.name, () => {
          // @ts-expect-error we're testing invalid inputs
          expect(validateTubeName(test.in)).toStrictEqual(test.out);
        });
      }
    }
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

    for (const test of tableTests) {
      if (test.out instanceof Error) {
        it(test.name, () => {
          expect(() => {
            // @ts-expect-error we're testing invalid inputs
            validatePriority(test.in);
          }).toThrowError(test.out);
        });
      } else {
        it(test.name, () => {
          // @ts-expect-error we're testing invalid inputs
          expect(validatePriority(test.in)).toStrictEqual(test.out);
        });
      }
    }
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

    for (const test of tableTests) {
      if (test.out instanceof Error) {
        it(test.name, () => {
          expect(() => {
            // @ts-expect-error we're testing invalid inputs
            validateDelay(test.in);
          }).toThrowError(test.out);
        });
      } else {
        it(test.name, () => {
          // @ts-expect-error we're testing invalid inputs
          expect(validateDelay(test.in)).toStrictEqual(test.out);
        });
      }
    }
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

    for (const test of tableTests) {
      if (test.out instanceof Error) {
        it(test.name, () => {
          expect(() => {
            // @ts-expect-error we're testing invalid inputs
            validateTTR(test.in);
          }).toThrowError(test.out);
        });
      } else {
        it(test.name, () => {
          // @ts-expect-error we're testing invalid inputs
          expect(validateTTR(test.in)).toStrictEqual(test.out);
        });
      }
    }
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
        name: 'timeout below minimal',
        in: TIMEOUT_MIN - 1,
        out: new TypeError(`timeout should be >= ${TIMEOUT_MIN}`),
      },
      {
        name: 'non-number timeout',
        in: '123',
        out: new TypeError(`timeout should be a number, got string`),
      },
    ];

    for (const test of tableTests) {
      if (test.out instanceof Error) {
        it(test.name, () => {
          expect(() => {
            // @ts-expect-error we're testing invalid inputs
            validateTimeout(test.in);
          }).toThrowError(test.out);
        });
      } else {
        it(test.name, () => {
          // @ts-expect-error we're testing invalid inputs
          expect(validateTimeout(test.in)).toStrictEqual(test.out);
        });
      }
    }
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
        name: 'non-number priority',
        in: '123',
        out: new TypeError(`job id should be a number, got string`),
      },
    ];

    for (const test of tableTests) {
      if (test.out instanceof Error) {
        it(test.name, () => {
          expect(() => {
            // @ts-expect-error we're testing invalid inputs
            validateJobId(test.in);
          }).toThrowError(test.out);
        });
      } else {
        it(test.name, () => {
          // @ts-expect-error we're testing invalid inputs
          expect(validateJobId(test.in)).toStrictEqual(test.out);
        });
      }
    }
  });
});
