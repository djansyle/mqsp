# MQSP

MQSP is a tool for mysql that supports for multiple read and write replica.
It also support object parsing(escaped) for your query.

```javascript
  import MQSP from 'mqsp';

  const result = await mqsp.exec('SELECT :message AS message', { message: 'hello' });
  // query will be translated to `SELECT 'hello' AS message`.
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

## API
### Constructor
Creates a pool of the given config. The config is passed to the `createPool` function
of the library `mysql`. Only that, the host is being replaced with the values under
the `writeHosts` and `readHosts`.

### Query single row (read)
```javascript
  const row = await mqsp.getRow('SELECT * FROM users');
  // `row` will contain an Object(not an Array) of the user.
  // If no result match of the given query, the return is `undefined`
```

### Query multiple row (read)
```javascript
  const rows = await mqsp.getRows('SELECT * FROM users');
  // `rows` will contain an Array of Object of the user.
```

### Exec (write)
```javascript
  const result = await mqsp.exec('INSERT INTO users(id, username) VALUES (:id, :username)', { id: 482, username: 'John Doe'});
  // `result` will contain the same object when you call `mysql.query`.
```
