<div align="center">

# node-beanstalk

[![NPM Version](https://flat.badgen.net/npm/v/node-beanstalk)](https://www.npmjs.com/package/node-beanstalk)
[![NPM Downloads](https://flat.badgen.net/npm/dm/node-beanstalk)](https://www.npmjs.com/package/node-beanstalk)
[![NPM Dependents](https://flat.badgen.net/npm/dependents/node-beanstalk)](https://www.npmjs.com/package/node-beanstalk)
[![Build](https://img.shields.io/github/actions/workflow/status/xobotyi/node-beanstalk/ci.yml?branch=master&style=flat-square)](https://github.com/xobotyi/node-beanstalk/actions/workflows/ci.yml)
[![Coverage](https://flat.badgen.net/codecov/c/github/xobotyi/node-beanstalk)](https://app.codecov.io/gh/xobotyi/node-beanstalk)
[![Types](https://flat.badgen.net/npm/types/node-beanstalk)](https://www.npmjs.com/package/node-beanstalk)
</div>

## INSTALL

```shell
npm i node-beanstalk
# or
yarn add node-beanstalk
```

The package is published as ES modules only and requires Node.js 24 or newer.

## USAGE

`node-beanstalk` fully supports
[beanstalk protocol v1.13](https://github.com/beanstalkd/beanstalkd/blob/v1.13/doc/protocol.txt)

### Client

`node-beanstalk` is built with use of promises.  
Each client gives you full access to functionality of beanstalk queue manager, without strict
separation to emitter and worker.

```ts
import {Client, BeanstalkJobState} from 'node-beanstalk';

const c = new Client();

// connect to beasntalkd server
await c.connect();
// use our own tube
await c.use('my-own-tube');

// put our very important job
const putJob = await c.put({foo: 'My awsome payload', bar: ['baz', 'qux']}, 40);
if (putJob.state !== BeanstalkJobState.ready) {
	// as a result of put command job can done in `buried` state,
	// or `delayed` in case delay or client's default delay been specified
	throw new Error('job is not in ready state');
}

// watch our tube to be able to reserve from it
await c.watch('my-own-tube');

// acquire new job (ideally the one we've just put)
const job = await c.reserveWithTimeout(10);
/*
  ...do some important job
 */

c.delete(job.id);
c.disconnect();
```

As beanstalk is pretty fast but still synchronous on a single connection - all consecutive calls
will wait for the end of previous one. So below code will be executed consecutively, despite the
fact of being asyncronous.

```ts
import {Client, BeanstalkJobState} from 'node-beanstalk';

const c = new Client();
await c.connect();

c.reserve();
c.reserve();
c.reserve();
c.reserve();
c.reserve();
```

Above code will reserve 5 jobs one by one, in asyncronous way (each next promise will be resolved
one by one).

#### Disconnect

To disconnect the client from remote - call `client.disconnect()`, it will wait for all the pending
requests to be performed and then disconnect the client from server. All commands queued after
disconnection will be rejected; a second `disconnect()` queued behind it resolves once the connection is closed.

To disconnect client immediately - call `client.disconnect(true)`, it will perform disconnect right
after currently running request.

The client implements `Symbol.asyncDispose`, so `await using` disconnects it when the scope ends. Disposal awaits a
`disconnect()` that is still in flight and does nothing when the client is already disconnected, so a manual
`disconnect()` inside the scope is safe:

```ts
import {Client} from 'node-beanstalk';

await using c = new Client();
await c.connect();

await c.put({foo: 'bar'});
// c.disconnect() runs here
```

#### Connection loss

The client reports the state of its connection through three events:

- `connect` — the connection is open, after `connect()` succeeded.
- `close` — the connection is gone, whether `disconnect()` closed it or the socket died.
- `error` — the socket failed. As on any Node `EventEmitter`, an `error` with no listener is thrown, so attach one.

A command that was waiting for its response when the connection died rejects with a `ClientError` of code
`ErrConnectionClosed`, carrying the socket error as its `cause` where there was one. Commands issued after that reject
with `ErrConnectionNotOpened` until `connect()` succeeds again.

A reconnect gives you a fresh connection, and a beanstalk connection holds state that the new one does not inherit.
The server released every job the old connection had reserved, the tube of `use` is back to `default`, and so is the
watch list. A client that reconnects has to `use` and `watch` again, and a job it was working on may already be running
somewhere else.

```ts
import {Client} from 'node-beanstalk';

const c = new Client({connectTimeoutMs: 5000});

c.on('error', (err) => {
	console.error('beanstalk connection failed', err);
});

c.on('close', async () => {
	await new Promise((resolve) => setTimeout(resolve, 1000));

	try {
		await c.connect();
		// the new connection watches `default` until we say otherwise
		await c.watch('my-own-tube');
	} catch {
		// a dial that fails emits `close` again, which brings us back here
	}
});

await c.connect();
await c.watch('my-own-tube');
```

`close` also fires for the `disconnect()` you called yourself, so a handler like the one above keeps reconnecting while
your process shuts down. Guard it with a flag you set before the final `disconnect()`.

#### Timeouts

Out of the box the client waits as long as the operating system and the server make it wait. Three options bound that,
and two of them cost the connection when they expire:

- `connectTimeoutMs` bounds the dial. On expiry `connect()` rejects with `ErrConnectTimeout`, and nothing is lost
  because there was no connection yet. Without it a dial into a black hole can take more than a minute.
- `responseTimeoutMs` bounds the wait for the response of a command. On expiry the command rejects with
  `ErrResponseTimeout` **and the connection is dropped**.
- `dataReadTimeoutMs` (default `1000`) bounds the wait for the body of a response whose headers already arrived. On
  expiry the command rejects with `ErrResponseRead` **and the connection is dropped**.

The drop is not an implementation detail; it is the only way out. One connection carries one command at a time and the
protocol has no cancel, so a client that stops waiting for a response it already asked for has to close the socket —
otherwise the response it gave up on is read as the headers of the next command. Closing the socket makes the server:

- release every job this connection had reserved, which hands each of them to another worker while this process may
  still be running the job;
- forget the tube of `use`, so the next `put` goes to `default`;
- forget the watch list, so the next `reserve` watches `default`.

That is why `responseTimeoutMs` is off by default. Turn it on when a broker that goes silent is a bigger risk than a
job running twice, and keep the value well above the time your server needs under load. `reserve()` is never bounded by
it, because the server holds that command until a job exists, and `reserveWithTimeout(n)` adds its own `n` seconds to
the deadline.

#### Payload serialization

As in most cases our job payloads are complex objets - they somehow must be serialized to Buffer. In
general, serialized payload can be any bytes sequence, but by default, payload is serialized via
JSON and casted to buffer, but you can specify your own serializer by passing corresponding
parameter to client constructor options. The required interface is the exported `Serializer` type.

### Pooling

For the cases of being used within webservers when waiting for all previous requests is not an
option - `node-beasntalk` Pool exists.

#### Why?

- Connecting new client requires a handshake, which takes some time (around 10-20ms), so creating
  new client on each incoming request would substantially slow down our application.
- As already being said - each connection can handle only one request at a time. So in case you
  application use a single client - all your simultaneous requests will be pipelined into serial
  execution queue, one after another, that is really no good (despite of `node-beanstalk` queue
  being very fast and low-cost).

Client pool allows you to have a pool af reusable clients you can check out, use, and return back to
the pool.

#### Checkout, use, and return

```ts
import {Pool} from 'node-beanstalk';

const p = new Pool({capacity: 5});

// acquire our very own client
const client = await p.connect();

try {
	// do some work
	await client.statsTube('my-own-tube');
} finally {
	// return client back to the pool
	client.releaseClient();
}
```

You **must always** release client back to the pool, otherwise, at some point, your pool will be
empty forever, and your subsequent requests will wait forever.

A pool client implements `Symbol.asyncDispose` by releasing itself, so `await using` guarantees the
return:

```ts
import {Pool} from 'node-beanstalk';

const p = new Pool({capacity: 5});

await using client = await p.connect();

await client.statsTube('my-own-tube');
// client.releaseClient() runs here
```

#### Disconnect

To disconnect all clients in the pool you have to call `pool.disconnect()`.  
This will wait for all pending client reserves and returns to be done. After disconnect executed all
returned clients will be disconnected and not returned to the idle queue. All reserves queued after
disconnection will be rejected.

Force disconnect `pool.disconnect(true)` will not wait for pending reserve and start disconnection
immediately (it will still be waiting clients return to the pool) by calling force disconnect on
each client.

From the moment either one is called, `pool.connect()` rejects with a `PoolError`: a client handed out during the wait
would be closed while its caller still holds it. `pool.restore()` opens the pool for new callers again.

#### Dead clients

A client that loses its connection leaves the pool. It is not handed out again, releasing it does nothing, and its slot
goes to the first caller in the queue, which receives a new connected client instead. A client that fails to connect
gives its slot back the same way, so a server that is down does not shrink the pool.

The pool keeps an `error` listener on every client it owns, so a broker restart does not throw an unhandled `error` in
your process. What the pool cannot give back are the jobs those clients had reserved — the server released them when
the connections went down, as described under
[connection loss](#connection-loss).

`pendingTimeoutMs` bounds the wait in the queue. A caller that reaches it rejects with a `PoolError` and leaves the
queue, so the next released client goes to whoever is behind it. Keep the value above
`clientOptions.responseTimeoutMs`, otherwise a caller gives up before the command that holds a client reaches its own
deadline.

```ts
import {Pool} from 'node-beanstalk';

const p = new Pool({
	capacity: 5,
	pendingTimeoutMs: 10_000,
	clientOptions: {connectTimeoutMs: 5000, responseTimeoutMs: 5000},
});
```

## TEST

`node-beanstalk` is built to be as much tests-covered as it is possible, but not to go nuts with LOC
coverage. It is important to have comprehensive unit-testing to make sure that everything is working
fine, and it is my goal for this package.

It is pretty hard to make real tests for the sockets witch is used in this package, so `Connection`
class is still at 80% covered with tests, maybe I'll finish it later.
