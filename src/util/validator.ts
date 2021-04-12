import {
  DELAY_MAX,
  DELAY_MIN,
  JOB_ID_MIN,
  PRIORITY_MAX,
  PRIORITY_MIN,
  TIMEOUT_MIN,
  TTR_MAX,
  TTR_MIN,
} from '../const';

const tubeNameValidateRE = /^[A-Za-z0-9\-+/;.$_()]{1,200}$/;

export function validateTubeName(name: string): void {
  if (typeof name !== 'string') {
    throw new TypeError(`tube name should be a string, got ${typeof name}`);
  }

  if (!tubeNameValidateRE.test(name)) {
    throw new TypeError(`tube name should satisfy regexp: ${tubeNameValidateRE}`);
  }
}

export function validatePriority(priority: number): void {
  if (typeof priority !== 'number') {
    throw new TypeError(`priority should be a number, got ${typeof priority}`);
  }

  if (priority < PRIORITY_MIN) {
    throw new TypeError(`priority should be >= ${PRIORITY_MIN}`);
  }
  if (priority > PRIORITY_MAX) {
    throw new TypeError(`priority should be <= ${PRIORITY_MAX}`);
  }
}

export function validateDelay(delay: number): void {
  if (typeof delay !== 'number') {
    throw new TypeError(`delay should be a number, got ${typeof delay}`);
  }

  if (delay < DELAY_MIN) {
    throw new TypeError(`delay should be >= ${DELAY_MIN}`);
  }
  if (delay > DELAY_MAX) {
    throw new TypeError(`delay should be <= ${DELAY_MAX}`);
  }
}

export function validateTTR(ttr: number): void {
  if (typeof ttr !== 'number') {
    throw new TypeError(`ttr should be a number, got ${typeof ttr}`);
  }

  if (ttr < TTR_MIN) {
    throw new TypeError(`ttr should be >= ${TTR_MIN}`);
  }
  if (ttr > TTR_MAX) {
    throw new TypeError(`ttr should be <= ${TTR_MAX}`);
  }
}

export function validateTimeout(timeout: number): void {
  if (typeof timeout !== 'number') {
    throw new TypeError(`timeout should be a number, got ${typeof timeout}`);
  }

  if (timeout < TIMEOUT_MIN) {
    throw new TypeError(`timeout should be >= ${TIMEOUT_MIN}`);
  }
}

export function validateJobId(jobId: number): void {
  if (typeof jobId !== 'number') {
    throw new TypeError(`job id should be a number, got ${typeof jobId}`);
  }

  if (jobId < JOB_ID_MIN) {
    throw new TypeError(`job id should be >= ${JOB_ID_MIN}`);
  }
}
