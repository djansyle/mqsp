# MQSP

MQSP is a tool for mysql that supports for multiple read and write replica.
It also support object parsing(escaped) for your query, and result caching.
Any property that is not mapped in the query will have a default value of `NULL`.

[![CircleCI](https://img.shields.io/circleci/project/github/djansyle/mqsp.svg?style=flat-square)](https://circleci.com/gh/djansyle/mqsp) [![npm](https://img.shields.io/npm/dm/mqsp.svg?style=flat-square)](https://www.npmjs.com/package/mqsp)

```javascript
  import { MQSP } from 'mqsp';

  const mqsp = new MQSP();
  const result = await mqsp.exec(`
    SELECT :message AS message, :nonExist AS val
  `, { message: 'hello' });
  console.log(result);
  // { message: 'hello', val: null }
```

## Quickstart
```javascript
  import { initialize, MQSP } from 'mqsp';

  initialize({
    user: 'root',
    password: 'hardpassword',
    database: 'db',
    writeHosts: ['localhost', 'localhost'],
    readHosts: ['localhost', 'localhost']
  });
  const mqsp = new MQSP();

  let result = await mqsp.getRow('SELECT hello AS message');
  console.log(result);
  // { message: 'hello' }

  result = await mqsp.getRows('SELECT hello AS message UNION ALL SELECT world AS message');
  console.log(result);
  // [{ message: 'hello' }, { message: 'world' }];
```
You can also pass a config like this, if your read and write hosts are the same.
```javascript
  initialize({
    user: 'root',
    password: 'hardpassword',
    database: 'db',
    host: 'localhost'
  })
```
Instead of adding them both to `writePool` and `readPool` array.

## Caching
Read operations are being cached with a max age of 5 minutes.

```javascript
  const res = await mqsp.getRow('SELECT DATE_ADD(NOW(6), INTERVAL :ms MICROSECOND)', { ms: 777 });
  await Promise.delay(10);
  const cached = await mqsp.getRow('SELECT DATE_ADD(NOW(6), INTERVAL :ms MICROSECOND)', { ms: 777 });
  assert.deepEqual(res, cached);
```

## Transaction
MQSP supports mysql transaction.

```javascript
  const transaction = mqsp.getTransaction();
  await transaction.beginTransaction();
  await transaction.exec('UPDATE users SET username = 'djansyle' WHERE id = 1');
  await transaction.commit();
```

## API
### Constructor
Creates a pool of the given config. The config is passed to the `createPool` function
of the library `mysql`. Only that, the host is being replaced with the values under
the `writePool` and `readPool`.

### Query single row (read)
Get a single row, of the query.
```javascript
  const row = await mqsp.getRow('SELECT * FROM users');
  // `row` will contain an Object(not an Array) of the user.
  // If no result match of the given query, the return is `undefined`
```

### Query multiple row (read)
Gets all the rows based on the query.
```javascript
  const rows = await mqsp.getRows('SELECT * FROM users');
  // `rows` will contain an Array of Object of the user.
```

### Exists (read)
Determines whether the query does return a value.
```javascript
    let res = await mqsp.exists('SELECT 1');
    console.log(res);
    // true

    res = await mqsp.exists('SELECT 1 FROM (SELECT 1) AS tmp WHERE 1 = 0');
    console.log(res);
    // false
```

### Exec (write)
Executes the query and give the query result. Suggested not to use this for select statements or any other read operation.
```javascript
  const result = await mqsp.exec('INSERT INTO users(id, username) VALUES (:id, :username)', { id: 482, username: 'John Doe'});
  // `result` will contain the same object when you call `mysql.query`.
```

### Get Transaction
Retrieve a transaction from an mqsp instance. Transaction API is the same with MQSP API, only
is that under utilities is not included.
```javascript
    const transaction = mqsp.getTransaction();
    await transaction.beginTransaction();
    await transaction.exec('UPDATE users SET username = 'djansyle' WHERE id = 1');
    await transaction.commit();
```

## Utilities
### toTimestamp(date, [excludeMs = true])
Converts the javascript date object to MySQL Timestamp format.

```javascript
  const date = new Date('2017-07-07 07:07:07.777');
  const timestamp = MQSP.toTimestamp(date, true);
  console.log(timestamp);
  // 2017-07-07 07:07:07.00
```
### escape(val)
Escapes the value to prevent sql injection.
```javascript
  const res = await mqsp.exec(`SELECT ${mqsp.escape(';;DROP mysql;')} AS val`);
  console.log(res.affectedRows);
  console.log(res[0]);
  // undefined
  // RowDataPacket {
  //   val: ";;DROP mysql;",
  // }
```

### Close
Closes the read and write connection pool
```javascript
  import { close } from 'mqsp';
  await close();
  await mqsp.getRow('SELECT 1');
  // Will throw an error
```