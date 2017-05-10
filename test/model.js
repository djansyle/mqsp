import test from 'ava';
import times from 'lodash/times';

import MQSP from './../src/index';

let mqsp = null;

const config = {
  user: 'root',
  password: '',
  connectionLimit: 20,
  writeHosts: ['172.20.0.2', '172.20.0.2'],
  readHosts: ['172.20.0.2', '172.20.0.2'],
};

test.before(() => {
  mqsp = new MQSP(config);
});

test('Constructor', async (t) => {
  const mqspTmp = new MQSP({ host: '172.20.0.2', user: 'root', password: '', connectionLimit: 20 });
  t.is(mqspTmp.writeHosts.indexOf('172.20.0.2'), 0);
  t.is(mqspTmp.readHosts.indexOf('172.20.0.2'), 0);

  const res = await mqspTmp.getRow('SELECT 1 AS reply');
  t.is(res.reply, 1);

  const instance = new MQSP({});
  t.is(instance.writeHosts.indexOf('localhost'), 0);
  t.is(instance.readHosts.indexOf('localhost'), 0);
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
  const res = await mqsp.getRow('SELECT :val AS field, :noVal AS field2', { val: 1 });
  t.is(res.field, 1);
  t.is(res.field2, null);
});

test('exists', async (t) => {
  let res = await mqsp.exists('SELECT 1');
  t.is(res, true);

  res = await mqsp.exists('SELECT 1 FROM (SELECT 1) AS tmp WHERE 1 = 0');
  t.is(res, false);
});

test('connection', async (t) => {
  await Promise.all(times(config.connectionLimit * 2)
    .map(() => mqsp.exec('SELECT 1')));

  t.pass();
});

test('toTimestamp: excludeMs = true', (t) => {
  const date = new Date('2017-07-07 07:07:07.777');
  const timestamp = MQSP.toTimestamp(date, true);
  t.is(timestamp, '2017-07-07 07:07:07.00');
});

test('toTimestamp: excludeMS = false', (t) => {
  const date = new Date('2017-07-07 07:07:07.777');
  const timestamp = MQSP.toTimestamp(date, false);
  t.is(timestamp, '2017-07-07 07:07:07.777');
});

test('throw', async (t) => {
  await t.throws(mqsp.exec('SELECT invalidQuery'));
});

test('escape', async (t) => {
  const res = await mqsp.exec(`SELECT ${mqsp.escape(';;DROP mysql')} AS val`);
  t.is(res.affectedRows, undefined);
  t.is(res[0].val, ';;DROP mysql');
});
