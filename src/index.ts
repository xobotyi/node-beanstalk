import { Beanstalk } from './Beanstalk';

(async () => {
  const client = new Beanstalk({ debug: true });

  await client.connect();
  await client.stats();
  await client.disconnect();
})();
