import { DELAY_MAX, DELAY_MIN, PRIORITY_MAX, PRIORITY_MIN, TTR_MAX, TTR_MIN } from '../const';

const tubeNameValidateRE = /^[A-Za-z0-9\-+/;.$_()]{1,200}$/;

export function validateTubeName(name: string): void {
  if (!tubeNameValidateRE.test(name)) {
    throw new TypeError(`tube name should satisfy regexp: ${tubeNameValidateRE}`);
  }
}

export function validatePriority(priority: number): void {
  if (priority < PRIORITY_MIN) {
    throw new TypeError(`priority should be >= ${PRIORITY_MIN}`);
  }
  if (priority > PRIORITY_MAX) {
    throw new TypeError(`priority should be <= ${PRIORITY_MAX}`);
  }
}

export function validateDelay(delay: number): void {
  if (delay < DELAY_MIN) {
    throw new TypeError(`delay should be >= ${DELAY_MIN}`);
  }
  if (delay > DELAY_MAX) {
    throw new TypeError(`delay should be <= ${DELAY_MAX}`);
  }
}

export function validateTTR(delay: number): void {
  if (delay < TTR_MIN) {
    throw new TypeError(`ttr should be >= ${TTR_MIN}`);
  }
  if (delay > TTR_MAX) {
    throw new TypeError(`ttr should be <= ${TTR_MAX}`);
  }
}

export function validateTimeout(timeout: number): void {
  if (timeout < 0) {
    throw new TypeError(`timeout should be >= ${0}`);
  }
}

export function validateJobId(jobId: number): void {
  if (jobId <= 0) {
    throw new TypeError(`timeout should be > ${0}`);
  }
}
