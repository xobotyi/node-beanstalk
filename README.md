<div align="center">

# node-beanstalk

[![NPM Version](https://flat.badgen.net/npm/v/node-beanstalk)](https://www.npmjs.com/package/node-beanstalk)
[![NPM Downloads](https://flat.badgen.net/npm/dm/node-beanstalk)](https://www.npmjs.com/package/node-beanstalk)
[![NPM Dependents](https://flat.badgen.net/npm/dependents/node-beanstalk)](https://www.npmjs.com/package/node-beanstalk)
[![Build](https://img.shields.io/github/actions/workflow/status/xobotyi/node-beanstalk/ci-cd.yml?branch=master&style=flat-square)](https://github.com/xobotyi/node-beanstalk/actions)
[![Coverage](https://flat.badgen.net/codecov/c/github/xobotyi/node-beanstalk)](https://app.codecov.io/gh/xobotyi/node-beanstalk)
[![Types](https://flat.badgen.net/npm/types/node-beanstalk)](https://www.npmjs.com/package/node-beanstalk)

  <p>
    <strong><a href="https://xobotyi.github.io/node-beanstalk/">API Docs</a></strong>
  </p>
</div>

## INSTALL

```shell
npm i node-beanstalk
# or
yarn add node-beanstalk
```

## USAGE

`node-beanstalk` fully supports
[beanstalk protocol v1.12](https://raw.githubusercontent.com/beanstalkd/beanstalkd/master/doc/protocol.txt)

### Client

`node-beanstalk` is built with use of promises.  
Each client gives you full access to functionality of beanstalk queue manager, without strict
separation to emitter and worker.

```ts
import { Client, BeanstalkJobState } from "node-beanstalk";

const c = new Client();

// connect to beasntalkd server
await c.connect();
// use our own tube
await c.use("my-own-tube");

// put our very important job
const putJob = await c.put({ foo: "My awsome payload", bar: ["baz", "qux"] }, 40);
if (putJob.state !== BeanstalkJobState.ready) {
  // as a result of put command job can done in `buried` state,
  // or `delayed` in case delay or client's default delay been specified
  throw new Error("job is not in ready state");
}

// watch our tube to be able to reserve from it
await c.watch("my-own-tube");

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
import { Client, BeanstalkJobState } from "node-beanstalk";

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
To see all the Client methods and properties see
[Client API docs](https://xobotyi.github.io/node-beanstalk/classes/client.html)

#### Disconnect

To disconnect the client from remote - call `client.disconnect()`, it will wait for all the pending
requests to be performed and then disconnect the client from server. All requests queued after
disconnection will be rejected.

To disconnect client immediately - call `client.disconnect(true)`, it will perform disconnect right
after currently running request.

#### Connection Errors

If the connection to the Beanstalk server is closed unexpectedly then any command in progress will be aborted
by rejecting the promise, and the `Client` will emit a `close` event.

```ts
import { Client } from 'node-beanstalk';

const reconnect = async () => {
    console.log('Reconnecting...');

    // Wait for a cooldown period before retrying.
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    try {
        await c.connect();
    } catch (e) {
        // Ignore exceptions.
        // Failed calls to `connect() will emit `close` again.
    }
};

const c = new Client({ port: 11300, host: 'beanstalk' });

c.on('close', reconnect);
await c.connect();

while (true) {
    try {
        console.log('Reserving...');
        await c.reserve();
    } catch (e) {
        // Wait to be reconnected.
        if (!c.isConnected) {
            console.log('Awaiting reconnection...');
            await new Promise<void>((resolve) => c.once('connect', resolve));
        }
    }
}
```

#### Events

The following events are emitted by the `Client`:

  `connect`: Emitted when a call to `connect()` completes.
  `close`: Emitted when the connection to the Beanstalk server is closed.

#### Payload serialization

As in most cases our job payloads are complex objets - they somehow must be serialized to Buffer. In
general, serialized payload can be any bytes sequence, but by default, payload is serialized via
JSON and casted to buffer, but you can specify your own serializer by passing corresponding
parameter to client constructor options. Required serializer interface can be found in
[API docs](https://xobotyi.github.io/node-beanstalk/classes/serializer.html).

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
import { Pool } from "node-beanstalk";

const p = new Pool({ capacity: 5 });

// acquire our very own client
const client = await p.connect();

try {
  // do some work
  await client.statsTube("my-own-tube");
} finally {
  // return client back to the pool
  client.releaseClient();
}
```

You **must always** release client back to the pool, otherwise, at some point, your pool will be
empty forever, and your subsequent requests will wait forever.

#### Disconnect

To disconnect all clients in the pool you have to call `pool.disconnect()`.  
This will wait for all pending client reserves and returns to be done. After disconnect executed all
returned clients will be disconnected and not returned to the idle queue. All reserves queued after
disconnection will be rejected.

Force disconnect `pool.disconnect(true)` will not wait for pending reserve and start disconnection
immediately (it will still be waiting clients return to the pool) by calling force disconnect on
each client.

## TEST

`node-beanstalk` is built to be as much tests-covered as it is possible, but not to go nuts with LOC
coverage. It is important to have comprehensive unit-testing to make sure that everything is working
fine, and it is my goal for this package.

It is pretty hard to make real tests for the sockets witch is used in this package, so `Connection`
class is still at 80% covered with tests, maybe I'll finish it later.
