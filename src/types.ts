export type IClientCtorOptions = {
	/**
	 * Connection host.
	 *
	 * @default 127.0.0.1
	 */
	host?: string;

	/**
	 * Connection port.
	 *
	 * @default 11300
	 */
	port?: number;

	/**
	 * Default job priority.
	 *
	 * @default 1024
	 */
	defaultPriority?: number;

	/**
	 * Default delay value in seconds for `put` and `release` commands.
	 *
	 * @default 0
	 */
	defaultDelay?: number;

	/**
	 * Default TTR value in seconds for `put` command.
	 *
	 * @default 30
	 */
	defaultTTR?: number;

	/**
	 * Serializer that will process job data. Pass `undefined` explicitly to disable serialization: outgoing payloads
	 * must then be strings, and received payloads stay raw buffers.
	 *
	 * @default JsonSerializer
	 */
	serializer?: Serializer | undefined;

	/**
	 * Maximal payload size in bytes
	 *
	 * @default 65_536
	 */
	maxPayloadSize?: number;

	/**
	 * Time in milliseconds the client waits for the body of a response whose headers already arrived. On expiry the
	 * command rejects with a {@link ClientError} of code `ErrResponseRead` and the connection is dropped, because a
	 * body that was read in part leaves the rest of itself where the next command reads its headers.
	 *
	 * The drop costs what {@link IClientCtorOptions.responseTimeoutMs} states in full: the server releases every job
	 * reserved on this connection, and the tube of `use` and the watch list are gone.
	 *
	 * @default 1000
	 */
	dataReadTimeoutMs?: number;

	/**
	 * Time in milliseconds `connect()` waits for the TCP connection. On expiry it rejects with a
	 * {@link ConnectionError} of code `ErrConnectTimeout` and the client emits `close`.
	 *
	 * `0` leaves the wait to the operating system, which can hold a dial into a black hole for over a minute.
	 *
	 * @default 0
	 */
	connectTimeoutMs?: number;

	/**
	 * Time in milliseconds a command waits for its response, counted from the moment it is written to the socket.
	 * On expiry the command rejects with a {@link ClientError} of code `ErrResponseTimeout`.
	 *
	 * **The connection is dropped on expiry, and that costs everything the connection held.** The beanstalk
	 * protocol answers one command at a time over one socket and carries no way to cancel a command that was
	 * already sent, so the only way to stop waiting is to close the socket. The server then:
	 *
	 * - releases every job this connection had reserved, which hands each of them to another worker while this
	 *   process may still be running the job;
	 * - forgets the tube of `use`, so the next `put` on a reconnected client goes to `default`;
	 * - forgets the watch list of `watch` and `ignore`, so the next `reserve` watches `default`.
	 *
	 * Reconnecting restores none of it. A client that reserves jobs has to `watch` and `use` again, and the work
	 * of an in-flight job may be done twice. Keep the value well above the time the server needs under load, and
	 * leave it at `0` unless a broker that goes silent is the greater risk.
	 *
	 * The deadline never applies to {@link Client.reserve}, which the server holds until a job exists, and
	 * {@link Client.reserveWithTimeout} adds its own timeout to it.
	 *
	 * @default 0
	 */
	responseTimeoutMs?: number;
};

export type IPoolCtorOptions = {
	/**
	 * Options that will be used to instantiate pool clients.
	 *
	 * @default undefined
	 */
	clientOptions?: IClientCtorOptions;

	/**
	 * Maximum number of clients the pool can contain.
	 *
	 * @default 10
	 */
	capacity?: number;

	/**
	 * Time in milliseconds `connect()` waits in the queue when every client of the pool is reserved. On expiry it
	 * rejects with a {@link PoolError} and leaves the queue, so the next released client goes to the caller behind it.
	 *
	 * Keep it above `clientOptions.responseTimeoutMs`, so a caller is still queued when a command hits its deadline
	 * and frees the slot it held.
	 *
	 * `0` keeps the caller queued for as long as the pool needs to serve it.
	 *
	 * @default 0
	 */
	pendingTimeoutMs?: number;
};

export type IClientRawReservedJob = {
	id: number;
	payload: any;
};

/**
 * Contract a custom serializer satisfies to process job payloads.
 */
export type Serializer = {
	serialize(data: any): Buffer;

	deserialize(buffer: Buffer): any;
};

/**
 * Every command of the protocol, keyed by the name it carries on the wire.
 */
export const BeanstalkCommand = {
	put: 'put',
	use: 'use',
	reserve: 'reserve',
	'reserve-with-timeout': 'reserve-with-timeout',
	'reserve-job': 'reserve-job',
	delete: 'delete',
	release: 'release',
	bury: 'bury',
	touch: 'touch',
	watch: 'watch',
	ignore: 'ignore',
	peek: 'peek',
	'peek-ready': 'peek-ready',
	'peek-delayed': 'peek-delayed',
	'peek-buried': 'peek-buried',
	kick: 'kick',
	'kick-job': 'kick-job',
	stats: 'stats',
	'stats-job': 'stats-job',
	'stats-tube': 'stats-tube',
	'list-tubes': 'list-tubes',
	'list-tube-used': 'list-tube-used',
	'list-tubes-watched': 'list-tubes-watched',
	'pause-tube': 'pause-tube',
	quit: 'quit',
} as const satisfies Record<string, string>;
export type BeanstalkCommand = (typeof BeanstalkCommand)[keyof typeof BeanstalkCommand];

/**
 * Every response status of the protocol, keyed by the word it carries on the wire.
 */
export const BeanstalkResponseStatus = {
	BAD_FORMAT: 'BAD_FORMAT',
	BURIED: 'BURIED',
	DEADLINE_SOON: 'DEADLINE_SOON',
	DELETED: 'DELETED',
	DRAINING: 'DRAINING',
	EXPECTED_CRLF: 'EXPECTED_CRLF',
	FOUND: 'FOUND',
	INSERTED: 'INSERTED',
	INTERNAL_ERROR: 'INTERNAL_ERROR',
	JOB_TOO_BIG: 'JOB_TOO_BIG',
	KICKED: 'KICKED',
	NOT_FOUND: 'NOT_FOUND',
	NOT_IGNORED: 'NOT_IGNORED',
	OK: 'OK',
	OUT_OF_MEMORY: 'OUT_OF_MEMORY',
	PAUSED: 'PAUSED',
	RELEASED: 'RELEASED',
	RESERVED: 'RESERVED',
	TIMED_OUT: 'TIMED_OUT',
	TOUCHED: 'TOUCHED',
	UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
	USING: 'USING',
	WATCHING: 'WATCHING',
} as const satisfies Record<string, string>;
export type BeanstalkResponseStatus = (typeof BeanstalkResponseStatus)[keyof typeof BeanstalkResponseStatus];

export const BeanstalkDataResponseStatus = {
	[BeanstalkResponseStatus.OK]: BeanstalkResponseStatus.OK,
	[BeanstalkResponseStatus.RESERVED]: BeanstalkResponseStatus.RESERVED,
	[BeanstalkResponseStatus.FOUND]: BeanstalkResponseStatus.FOUND,
} as const;
export type IBeanstalkDataResponseStatus = keyof typeof BeanstalkDataResponseStatus;

export const BeanstalkErrorResponseStatus = {
	[BeanstalkResponseStatus.OUT_OF_MEMORY]: BeanstalkResponseStatus.OUT_OF_MEMORY,
	[BeanstalkResponseStatus.INTERNAL_ERROR]: BeanstalkResponseStatus.INTERNAL_ERROR,
	[BeanstalkResponseStatus.BAD_FORMAT]: BeanstalkResponseStatus.BAD_FORMAT,
	[BeanstalkResponseStatus.DRAINING]: BeanstalkResponseStatus.DRAINING,
	[BeanstalkResponseStatus.UNKNOWN_COMMAND]: BeanstalkResponseStatus.UNKNOWN_COMMAND,
} as const;
export type IBeanstalkErrorResponseStatus = keyof typeof BeanstalkErrorResponseStatus;

export type CommandResponseHeaders = {
	status: BeanstalkResponseStatus;
	hasData: boolean;
	dataLength: number;
	headers: string[];
	headersLineLen: number;
};

export type CommandResponse = {
	status: BeanstalkResponseStatus;
	headers: string[];
	data?: Buffer;
};

export type CommandHandledResponse<R extends BeanstalkResponseStatus = BeanstalkResponseStatus> =
	R extends IBeanstalkDataResponseStatus
		? {
				status: R;
				headers: string[];
				data: any;
			}
		: {
				status: R;
				headers: string[];
			};

export type IBeanstalkStats = {
	/**
	 * The number of ready jobs with priority < 1024.
	 */
	'current-jobs-urgent': number;

	/**
	 * The number of jobs in the ready queue.
	 */
	'current-jobs-ready': number;

	/**
	 * The number of jobs reserved by all clients.
	 */
	'current-jobs-reserved': number;

	/**
	 * The number of delayed jobs.
	 */
	'current-jobs-delayed': number;

	/**
	 * The number of buried jobs.
	 */
	'current-jobs-buried': number;

	/**
	 * The cumulative number of put commands.
	 */
	'cmd-put': number;

	/**
	 * The cumulative number of peek commands.
	 */
	'cmd-peek': number;

	/**
	 * The cumulative number of peek-ready commands.
	 */
	'cmd-peek-ready': number;

	/**
	 * The cumulative number of peek-delayed commands.
	 */
	'cmd-peek-delayed': number;

	/**
	 * The cumulative number of peek-buried commands.
	 */
	'cmd-peek-buried': number;

	/**
	 * The cumulative number of reserve commands.
	 */
	'cmd-reserve': number;

	/**
	 * The cumulative number of reserve-with-timeout commands.
	 */
	'cmd-reserve-with-timeout': number;

	/**
	 * The cumulative number of use commands.
	 */
	'cmd-use': number;

	/**
	 * The cumulative number of watch commands.
	 */
	'cmd-watch': number;

	/**
	 * The cumulative number of ignore commands.
	 */
	'cmd-ignore': number;

	/**
	 * The cumulative number of delete commands.
	 */
	'cmd-delete': number;

	/**
	 * The cumulative number of release commands.
	 */
	'cmd-release': number;

	/**
	 * The cumulative number of bury commands.
	 */
	'cmd-bury': number;

	/**
	 * The cumulative number of kick commands.
	 */
	'cmd-kick': number;

	/**
	 * The cumulative number of touch commands.
	 */
	'cmd-touch': number;

	/**
	 * The cumulative number of stats commands.
	 */
	'cmd-stats': number;

	/**
	 * The cumulative number of stats-job commands.
	 */
	'cmd-stats-job': number;

	/**
	 * The cumulative number of stats-tube commands.
	 */
	'cmd-stats-tube': number;

	/**
	 * The cumulative number of list-tubes commands.
	 */
	'cmd-list-tubes': number;

	/**
	 * The cumulative number of list-tube-used commands.
	 */
	'cmd-list-tube-used': number;

	/**
	 * The cumulative number of list-tubes-watched commands.
	 */
	'cmd-list-tubes-watched': number;

	/**
	 * The cumulative number of pause-tube commands.
	 */
	'cmd-pause-tube': number;

	/**
	 * The cumulative count of times a job has timed out.
	 */
	'job-timeouts': number;

	/**
	 * The cumulative count of jobs created.
	 */
	'total-jobs': number;

	/**
	 * The maximum number of bytes in a job.
	 */
	'max-job-size': number;

	/**
	 * The number of currently-existing tubes.
	 */
	'current-tubes': number;

	/**
	 * The number of currently open connections.
	 */
	'current-connections': number;

	/**
	 * The number of open connections that have each issued at least one put command.
	 */
	'current-producers': number;

	/**
	 * The number of open connections that have each issued at least one reserve command.
	 */
	'current-workers': number;

	/**
	 * The number of open connections that have issued a reserve command but not yet
	 * received a response.
	 */
	'current-waiting': number;

	/**
	 * The cumulative count of connections.
	 */
	'total-connections': number;

	/**
	 * The process id of the server.
	 */
	pid: number;

	/**
	 * The version string of the server.
	 */
	version: string;

	/**
	 * The cumulative user CPU time of this process in seconds and microseconds.
	 */
	'rusage-utime': number;

	/**
	 * The cumulative system CPU time of this process in seconds and microseconds.
	 */
	'rusage-stime': number;

	/**
	 * The number of seconds since this server process started running.
	 */
	uptime: number;

	/**
	 * The index of the oldest binlog file needed to store the current jobs.
	 */
	'binlog-oldest-index': number;

	/**
	 * The index of the current binlog file being written to. If binlog is not active this
	 * value will be 0.
	 */
	'binlog-current-index': number;

	/**
	 * The maximum size in bytes a binlog file is allowed to get before a new binlog file
	 * is opened.
	 */
	'binlog-max-size': number;

	/**
	 * The cumulative number of records written to the binlog.
	 */
	'binlog-records-written': number;

	/**
	 * The cumulative number of records written as part of compaction.
	 */
	'binlog-records-migrated': number;

	/**
	 * Set to "true" if the server is in drain mode,"false" otherwise.
	 */
	draining: boolean;

	/**
	 * A random id string for this server process, generated every time beanstalkd process
	 * starts.
	 */
	id: string;

	/**
	 * The hostname of the machine as determined by uname.
	 */
	hostname: string;

	/**
	 * The OS version as determined by uname
	 */
	os: string | null;

	/**
	 * The machine architecture as determined by uname
	 */
	platform: string;
};

export type IBeanstalkTubeStats = {
	/**
	 * The tube's name.
	 */
	name: string;

	/**
	 * The number of ready jobs with priority < 1024 in this tube.
	 */
	'current-jobs-urgent': number;

	/**
	 * The number of jobs in the ready queue in this tube.
	 */
	'current-jobs-ready': number;

	/**
	 * The number of jobs reserved by all clients in this tube.
	 */
	'current-jobs-reserved': number;

	/**
	 * The number of delayed jobs in this tube.
	 */
	'current-jobs-delayed': number;

	/**
	 * The number of buried jobs in this tube.
	 */
	'current-jobs-buried': number;

	/**
	 * The cumulative count of jobs created in this tube in the current beanstalkd process.
	 */
	'total-jobs': number;

	/**
	 * The number of open connections that are currently using this tube.
	 */
	'current-using': number;

	/**
	 * The number of open connections that have issued a reserve command while watching
	 * this tube but not yet received a response.
	 */
	'current-waiting': number;

	/**
	 * The number of open connections that are currently watching this tube.
	 */
	'current-watching': number;

	/**
	 * The number of seconds the tube has been paused for.
	 */
	pause: number;

	/**
	 * The cumulative number of delete commands for this tube
	 */
	'cmd-delete': number;

	/**
	 * The cumulative number of pause-tube commands for this tube.
	 */
	'cmd-pause-tube': number;

	/**
	 * The number of seconds until the tube is un-paused.
	 */
	'pause-time-left': number;
};

/**
 * Every state a job can be in, keyed by the word the server reports.
 */
export const BeanstalkJobState = {
	ready: 'ready',
	delayed: 'delayed',
	reserved: 'reserved',
	buried: 'buried',
} as const satisfies Record<string, string>;
export type BeanstalkJobState = (typeof BeanstalkJobState)[keyof typeof BeanstalkJobState];

export type IBeanstalkJobStats = {
	/**
	 * The job id
	 */
	id: number;

	/**
	 * The name of the tube that contains this job
	 */
	tube: string;

	/**
	 * "ready" or "delayed" or "reserved" or "buried"
	 */
	state: BeanstalkJobState;

	/**
	 * The priority value set by the put, release, or bury commands.
	 */
	pri: number;

	/**
	 * The time in seconds since the put command that created this job.
	 */
	age: number;

	/**
	 * The integer number of seconds to wait before putting this job in the ready queue.
	 */
	delay: number;

	/**
	 * The integer number of seconds a worker is allowed to run this job.
	 */
	ttr: number;

	/**
	 * The number of seconds left until the server puts this job into the ready queue
	 * This number is only meaningful if the job is reserved or delayed. If the job is
	 * reserved and this amount of time elapses before its state changes, it is considered
	 * to have timed out.
	 */
	'time-left': number;

	/**
	 * The number of the earliest binlog file containing this job.
	 * If -b wasn't used, this will be 0.
	 */
	file: number;

	/**
	 * The number of times this job has been reserved.
	 */
	reserves: number;

	/**
	 * The number of times this job has timed out during a reservation.
	 */
	timeouts: number;

	/**
	 * The number of times a client has released this job from a reservation.
	 */
	releases: number;

	/**
	 * The number of times this job has been buried.
	 */
	buries: number;

	/**
	 * The number of times this job has been kicked.
	 */
	kicks: number;
};
