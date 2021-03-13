import { BeanstalkClient } from './BeanstalkClient';

(async () => {
  const client = new BeanstalkClient({ debug: true });

  await client.connect();
  console.log(await client.listTubesWatched());
  await client.disconnect();
})();
