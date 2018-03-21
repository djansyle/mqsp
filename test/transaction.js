import test from 'ava';
import Promise from 'bluebird';
import times from 'lodash/times';

import { initialize, MQSP } from './../src/mqsp';

const config = {
  user: 'root',
  password: '',
  connectionLimit: 20,
  host: 'localhost',
  multipleStatements: true,
};

let mqsp = null;
const getVal = 'SELECT val FROM MQSPT.testTransaction WHERE id = ?';

test.before(async () => {
  initialize(config);
  mqsp = new MQSP(config);
  await mqsp.exec('DROP SCHEMA IF EXISTS MQSPT');
  await mqsp.exec('CREATE SCHEMA MQSPT DEFAULT CHARACTER SET utf8');
  await mqsp.exec(`
    CREATE TABLE MQSPT.testTransaction (
      id INT(11) AUTO_INCREMENT,
      val VARCHAR(255),
      
      PRIMARY KEY(id)
    ) ENGINE = InnoDB;
  `);
});

test.beforeEach(async (t) => {
  const { insertId } = await mqsp.exec('INSERT INTO MQSPT.testTransaction(val) VALUES(?)', ['hello']);
  Object.assign(t.context, { transaction: mqsp.getTransaction(), id: insertId });
});

test('Rollback', async (t) => {
  const { transaction } = t.context;
  await transaction.beginTransaction();

  await transaction.exec('UPDATE MQSPT.testTransaction SET val = ? WHERE id = ?', ['world', t.context.id]);
  t.is(await transaction.getRow(getVal, [t.context.id]).then(({ val }) => val), 'world');
  t.is(await mqsp.getRow(getVal, [t.context.id]).then(({ val }) => val), 'hello');

  // Get a connection reference before it cleans up.
  const { connection } = transaction;
  await transaction.rollback();
  await t.throws(transaction.getRow('SELECT 1'));
  t.is(await connection.queryAsync(getVal, [t.context.id]).then(([{ val }]) => val), 'hello');
});

test('Commit', async (t) => {
  const { transaction } = t.context;
  await transaction.beginTransaction();

  await transaction.exec('UPDATE MQSPT.testTransaction SET val = ? WHERE id = ?', ['world', t.context.id]);
  t.is(await transaction.getRow(getVal, [t.context.id]).then(({ val }) => val), 'world');
  t.is(await mqsp.getRow(getVal, [t.context.id]).then(({ val }) => val), 'hello');

  const { connection } = transaction;
  await transaction.commit();
  await t.throws(transaction.getRow('SELECT 1'));
  t.is(await connection.queryAsync(getVal, [t.context.id]).then(([{ val }]) => val), 'world');
});

test('Release, commit', async (t) => {
  await Promise.all(times(config.connectionLimit * 2)
    .map(async () => {
      const transaction = mqsp.getTransaction();
      await transaction.beginTransaction();
      await transaction.commit();
    }));
  t.pass();
});

test('Release, rollback', async (t) => {
  await Promise.all(times(config.connectionLimit * 2)
    .map(async () => {
      const transaction = mqsp.getTransaction();
      await transaction.beginTransaction();
      await transaction.rollback();
    }));
  t.pass();
});

test('endOnError = false', async (t) => {
  const { transaction } = t.context;
  transaction.endOnError = false;

  await transaction.beginTransaction();

  await transaction.exec('UPDATE MQSPT.testTransaction SET val = ? WHERE id = ?', ['world', t.context.id]);
  t.is(await transaction.getRow(getVal, [t.context.id]).then(({ val }) => val), 'world');
  await t.throws(transaction.exec('SIGNAL SQLSTATE \'ERR0R\' SET MESSAGE_TEXT = \'message\';'));
  t.falsy(transaction.ended);

  await transaction.commit();
  await t.throws(transaction.getRow('SELECT 1'));
  t.is(await mqsp.getRow(getVal, [t.context.id]).then(({ val }) => val), 'world');
});

test('endOnError = true', async (t) => {
  const { transaction } = t.context;
  transaction.endOnError = true;

  await transaction.beginTransaction();

  await transaction.exec('UPDATE MQSPT.testTransaction SET val = ? WHERE id = ?', ['world', t.context.id]);
  t.is(await transaction.getRow(getVal, [t.context.id]).then(({ val }) => val), 'world');
  await t.throws(transaction.exec('THIS IS AN ERROR'));
  t.truthy(transaction.ended);
  await t.throws(transaction.getRow('SELECT 1'));
});

