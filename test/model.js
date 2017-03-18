import test from 'ava';
import times from 'lodash/times';

let mqsp = null;
test.before(() => {
  Object.assign(process.env, {
    MYSQL_USER: 'root',
    MYSQL_PASSWORD: '',
    MYSQL_DATABASE: 'mysql',
    MYSQL_CONNECTION_LIMIT: 20,
    MYSQL_READ_HOST_0: 'localhost',
    MYSQL_WRITE_HOST_0: 'localhost',
  });

  const MQSP = require('./../build/index').default; // eslint-disable-line
  mqsp = new MQSP();
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
  await Promise.all(times(parseInt(process.env.MYSQL_CONNECTION_LIMIT, 0) * 2)
    .map(() => mqsp.exec('SELECT 1')));

  t.pass();
});
