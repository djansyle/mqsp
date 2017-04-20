# MQSP

MQSP is a tool for mysql that supports for multiple read and write replica.
It also support object parsing(escaped) for your query. Any property that is
not mapped in the query will have a default value of `NULL`.

```javascript
  import MQSP from 'mqsp';

  const result = await mqsp.exec(`
    SELECT :message AS message, :nonExist AS val
  `, { message: 'hello' });
  console.log(result);
  // { message: 'hello', val: null }
```

## Quickstart
```javascript
  import MQSP from 'mqsp';

  const mqsp = new MQSP({
    user: 'root',
    password: 'hardpassword',
    database: 'db',
    writeHosts: ['localhost', 'localhost'],
    readHosts: ['localhost', 'localhost']
  });

  let result = await mqsp.getRow('SELECT hello AS message');
  console.log(result);
  // { message: 'hello' }

  result = await mqsp.getRows('SELECT hello AS message UNION ALL SELECT world AS message');
  console.log(result);
  // [{ message: 'hello' }, { message: 'world' }];
```
You can also pass a config like this, if your read and write hosts are the same.
```javascript
  const mysql = new MQSP({
    user: 'root',
    password: 'hardpassword',
    database: 'db',
    host: 'localhost'
  })
```
Instead of adding them both to `writeHosts` and `readHosts` array.

## API
### Constructor
Creates a pool of the given config. The config is passed to the `createPool` function
of the library `mysql`. Only that, the host is being replaced with the values under
the `writeHosts` and `readHosts`.

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
