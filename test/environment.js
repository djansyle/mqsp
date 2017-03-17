import test from 'ava';

const config = {
  MYSQL_USER: 'root',
  MYSQL_PASSWORD: '',
  MYSQL_DB: 'mysql',
};

test('No write host provided', async (t) => {
  process.env = Object.assign(config, { MYSQL_READ_HOST_0: 'localhost' });
  t.throws(() => require('./../build/mqsp')); // eslint-disable-line
});

test('No read host provided', async (t) => {
  delete process.env.MYSQL_READ_HOST_0;
  process.env = Object.assign(config, { MYSQL_WRITE_HOST_0: 'localhost' });
  t.throws(() => require('./../build/mqsp')); // eslint-disable-line
});

test('No read and write host provided', async (t) => {
  delete process.env.MYSQL_READ_HOST_0;
  delete process.env.MYSQL_WRITE_HOST_0;

  t.throws(() => require('./../build/mqsp')); // eslint-disable-line
});
