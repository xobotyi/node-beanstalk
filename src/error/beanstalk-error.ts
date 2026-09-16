import {type ResponseStatus} from '../types.js';
import {ErrorWithCode} from './error-with-code.js';

export class BeanstalkError extends ErrorWithCode<ResponseStatus> {
	name = 'BeanstalkError';
}
