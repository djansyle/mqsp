import assert from 'assert';
import debug from 'debug';
import MQSP from './mqsp';

const logger = {
  info: debug('mqsp:transaction:info'),
  verbose: debug('mqsp:transaction:verbose'),
  error: debug('mqsp.transaction:error'),
};
export default class Transaction {
  /**
   * MQSP Transaction Constructor
   * @param {MQSP} mqsp
   * @param {boolean} [endOnError]
   */
  constructor(mqsp, endOnError = true) {
    assert(mqsp instanceof MQSP, 'Expecting an object that is an instance of MQSP.');
    this.mqsp = mqsp;
    this.connection = null;
    this.ended = false;
    this.endOnError = endOnError;
  }

  /**
   * Executes a query only if the connection is not ended.
   * @param {String} qs
   * @param {Object} qa
   * @param {boolean} [endOnError]
   * @returns {Promise.<*>}
   */
  async tryExec(qs, qa, endOnError = this.endOnError) {
    assert(this.connection, 'Transaction has not been started yet.');
    if (this.ended) {
      throw new Error('Transaction has already been ended.');
    }

    let res = null;
    try {
      res = await this.mqsp.query(qs, qa, this.connection, false);
    } catch (e) {
      logger.error(e);
      if (endOnError) {
        this.cleanup();
      }
      throw e;
    }
    return res;
  }

  /**
   * Starts the transaction.
   * @returns {Promise.<boolean>}
   */
  async beginTransaction(autoCommit = true) {
    assert.equal(typeof autoCommit, 'boolean');
    this.connection = await this.mqsp.borrowWrite();

    await this.tryExec(`
      SET autocommit = :autoCommit;
      START TRANSACTION;
    `, { autoCommit });

    logger.info(`Transaction started with autocommit = ${autoCommit}`);
    return true;
  }

  /**
   * Commit the transaction.
   * @returns {Promise.<boolean>}
   */
  async commit() {
    await this.tryExec('COMMIT');
    this.cleanup();
    logger.info('Transaction committed.');
    return true;
  }

  /**
   * Rollbacks the transaction.
   * @returns {Promise.<boolean>}
   */
  async rollback() {
    await this.tryExec('ROLLBACK');
    this.cleanup();
    logger.info('Transaction rollbacked.');
    return true;
  }

  /**
   * Gets a row of the current transaction state.
   * @param qs
   * @param qa
   * @returns {Promise.<TResult>}
   */
  async getRow(qs, qa) {
    return this.tryExec(qs, qa).then(([row]) => row);
  }

  /**
   * Gets a rows of the current trarnsaction state.
   * @param qs
   * @param qa
   * @returns {Promise.<*>}
   */
  async getRows(qs, qa) {
    return this.tryExec(qs, qa);
  }

  /**
   * Executes a query of the current transaction state.
   * @param qs
   * @param qa
   * @returns {Promise.<*>}
   */
  async exec(qs, qa) {
    return this.tryExec(qs, qa);
  }

  /**
   * Cleans up the transaction object. This will make the
   * transaction object not usable anymore.
   */
  cleanup() {
    this.connection.release();
    this.mqsp = null;
    this.connection = null;
    this.ended = true;
  }
}
