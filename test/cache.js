/* eslint-disable global-require */
import test from 'ava';
import Promise from 'bluebird';
import clearModuleCache from './helpers/clearModuleCache';

const config = {
  user: 'root',
  password: '',
  connectionLimit: 20,
  writeHosts: ['localhost', 'localhost'],
  readHosts: ['localhost', 'localhost'],
};

test.beforeEach(clearModuleCache);

test('disableCache: true', async (t) => {
  const { initialize, MQSP } = require('./../src/mqsp');
  initialize(Object.assign({}, config, { disableCache: true }));

  const mqsp = new MQSP();
  t.falsy(mqsp.cache);

  const res = await mqsp.getRow('SELECT 1 AS success;');
  t.truthy(res.success);
});

test('disableCache: false', async (t) => {
  const { initialize, MQSP } = require('./../src/mqsp');
  initialize(Object.assign({}, config, { disableCache: false }));

  const mqsp = new MQSP();
  t.truthy(mqsp.cache);

  const res = await mqsp.getRow('SELECT DATE_ADD(NOW(6), INTERVAL :ms MICROSECOND)', { ms: 777 });
  await Promise.delay(10);
  const cached = await mqsp.getRow('SELECT DATE_ADD(NOW(6), INTERVAL :ms MICROSECOND)', { ms: 777 });
  t.deepEqual(res, cached);
});
