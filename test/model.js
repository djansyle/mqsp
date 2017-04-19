import test from 'ava';
import times from 'lodash/times';

import MQSP from './../src/index';

let mqsp = null;

const config = {
  user: 'root',
  password: '',
  connectionLimit: 20,
  writeHosts: ['localhost', 'localhost'],
  readHosts: ['localhost', 'localhost'],
};

test.before(() => {
  mqsp = new MQSP(config);
});

test('exec', async () => {
  await mqsp.exec('SELECT 1;');
});

test('getRow', async (t) => {
  const res = await mqsp.getRow('SELECT ? AS field UNION ALL SELECT 2 AS field', [1]);
  t.is(res.field, 1);
});

test('getRows', async (t) => {
  const res = await mqsp.getRows('SELECT 1 AS field UNION ALL SELECT 2 AS field');
  t.is(res[0].field, 1);
  t.is(res[1].field, 2);
});

test('query format', async (t) => {
  const res = await mqsp.getRow('SELECT :val AS field', { val: 1 });
  t.is(res.field, 1);
});

test('connection', async (t) => {
  await Promise.all(times(config.connectionLimit * 2)
    .map(() => mqsp.exec('SELECT 1')));

  t.pass();
});
