import {
  BeanstalkDataResponseStatus,
  BeanstalkErrorResponseStatus,
  BeanstalkResponseStatus,
} from './const';

export interface IBeanstalkClientCtorOptions {
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
   * @default false
   */
  debug?: boolean;

  /**
   * Serializer that will process job data
   */
  serializer?: Serializer;

  /**
   * Maximal payload size in bytes
   *
   * @default 65_536
   */
  maxPayloadSize?: number;

  /**
   * Time in milliseconds which client will wait for data chunks.
   * If full data will not be read in given amount of time, client
   * will quit (disconnect and throw error).
   *
   * @default 1000
   */
  dataReadTimeout?: number;
}

export abstract class Serializer {
  abstract serialize(data: any): string;

  abstract deserialize(text: string): any;
}

export type IBeanstalkDataResponseStatus = keyof typeof BeanstalkDataResponseStatus;

export type IBeanstalkErrorResponseStatus = keyof typeof BeanstalkErrorResponseStatus;

export interface ICommandResponseHeaders {
  status: BeanstalkResponseStatus;
  hasData: boolean;
  dataLength: number;
  headers: string[];
  headersLineLen: number;
}

export interface ICommandResponse {
  status: BeanstalkResponseStatus;
  headers: string[];
  data?: string;
}

export type ICommandHandledResponse<
  R extends BeanstalkResponseStatus = BeanstalkResponseStatus
> = R extends IBeanstalkDataResponseStatus
  ? {
      status: R;
      headers: string[];
      data: any;
    }
  : {
      status: R;
      headers: string[];
    };

export interface IBeanstalkStats {
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
}

export interface IBeanstalkTubeStats {
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
}

export interface IBeanstalkClientRawReservedJob {
  id: number;
  payload: any;
}

export enum BeanstalkJobState {
  ready = 'ready',
  delayed = 'delayed',
  reserved = 'reserved',
  buried = 'buried',
}

export interface IBeanstalkJobStats {
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
}
