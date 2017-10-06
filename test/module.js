/* eslint-disable global-require */
import test from 'ava';

function clearModuleCache() {
  Object.keys(require.cache).forEach((key) => { delete require.cache[key]; });
}
const config = {
  user: 'root',
  password: '',
  connectionLimit: 20,
  writeHosts: ['localhost', 'localhost'],
  readHosts: ['localhost', 'localhost'],
};

test.beforeEach(clearModuleCache);

test('Initialize', (t) => {
  const { initialize, MQSP } = require('./../src/mqsp');
  initialize(config);
  // should not throw any error when initializing the MQSP class
  t.truthy(new MQSP());
});

test('Close', async (t) => {
  const { initialize, close, MQSP } = require('./../src/mqsp');
  initialize(config);
  await close();
  t.throws(() => new MQSP());
});
