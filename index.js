const { CloudWatchLogsClient, CreateLogGroupCommand, CreateLogStreamCommand, PutLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

const { Transport } = require('winston');
const Debug = require('debug');

const debugMessages = Debug('CloudWatchTransport:messages');
const debugStats = Debug('CloudWatchTransport:stats');
const debug = Debug('CloudWatchTransport');


// really hard to find docs about winston transports, so inspired by:
// https://github.com/winstonjs/winston/blob/master/lib/winston/transports/file.js
// https://github.com/winstonjs/winston-transport/issues/33


// https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html
const maxBatchNumItems = 10000;
const maxMessageNumBytes = 256000; // the real max size is 262144
const maxBatchNumBytes = 1048576;

// An error class when there's no point in trying anymore
class FatalError extends Error {
  constructor(cause) {
    super('Fatal error');
    this.cause = cause;
  }
}

function transport({ client, logGroupName, logStreamName, shouldCreateLogGroup, shouldCreateLogStream, formatLog, onError, onFatalError, minInterval, maxQueuedBatches }) {
  const batches = [];
  let currentBatchTotalMessageSize = 0;
  let stopped = false;
  let createdLogGroup = false;
  let createdLogStream = false;

  let timeout;
  const callbacks = new Set();

  async function createLogGroup() {
    try {
      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/CreateLogGroupCommand/
      await client.send(new CreateLogGroupCommand({
        logGroupName,
        // todo:
        // kmsKeyId,
        // tags,
      }));
    } catch (err) {
      if (err.name === 'ResourceAlreadyExistsException') {
        // OK
      } else if (['InvalidParameterException', 'LimitExceededException'].includes(err.name)) {
        throw new FatalError(err);
      }
      throw err;
    }
    createdLogGroup = true;
  }

  async function createLogStream() {
    try {
      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/CreateLogStreamCommand/
      await client.send(new CreateLogStreamCommand({
        logGroupName,
        logStreamName,
      }));
    } catch (err) {
      if (err.name === 'ResourceAlreadyExistsException') {
        // OK
      } else if (['InvalidParameterException', 'ResourceNotFoundException'].includes(err.name)) {
        throw new FatalError(err);
      }
      throw err; // retry
    }
    createdLogStream = true;
  }

  function callCallbacksIfEmptyQueue() {
    if (batches.length === 0) { // queue is empty, call the callbacks!
      callbacks.forEach((callback) => {
        try {
          callback();
        } catch (err) { /* ignored */ }
      });
      callbacks.clear();
    }
  }

  async function processQueue() {
    try {
      callCallbacksIfEmptyQueue();

      const batch = batches.shift();
      if (batch == null) return;

      try {
        if (!createdLogGroup && shouldCreateLogGroup) await createLogGroup();
        if (!createdLogStream && shouldCreateLogStream) await createLogStream();

        debug('sending batch');

        // throw new FatalError(new Error('test'));

        try {
          // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/PutLogEventsCommand/
          const response = await client.send(new PutLogEventsCommand({
            logGroupName,
            logStreamName,
            logEvents: batch,
          }));

          debug('sent batch');

          if (response.rejectedLogEventsInfo != null) onError(new Error('Rejected log events'));
          // todo
          /* {
            tooNewLogEventStartIndex: Number("int"),
            tooOldLogEventEndIndex: Number("int"),
            expiredLogEventEndIndex: Number("int"),
          } */
        } catch (err) {
          if (err.name === 'DataAlreadyAcceptedException') {
            // OK
          } else if (['InvalidParameterException', 'InvalidSequenceTokenException', 'ResourceNotFoundException', 'UnrecognizedClientException'].includes(err.name)) {
            throw new FatalError(err);
          }
          throw err; // retry
        }
      } catch (err) {
        if (err instanceof FatalError) {
          onFatalError(err.cause);
          return;
        }

        // non-fatal errors: retry forever, in cause internet got disconnected temporarily etc
        onError(err);
        batches.unshift(batch); // put it back for retry
      }
    } finally {
      if (!stopped) timeout = setTimeout(processQueue, minInterval);
    }
  }

  async function log(timestamp, info) {
    const message = formatLog(info);

    const messageBytesSize = Buffer.byteLength(message, 'utf8');

    if (messageBytesSize > maxMessageNumBytes) {
      // todo truncate instead?
      throw new Error(`Skipping too long log message (${messageBytesSize} bytes)`);
      // if we were to send this message, we will get InvalidParameterException from AWS
    }

    if (batches.length >= maxQueuedBatches) {
      throw new Error('Queue is full, skipping log message');
      // this is just to prevent memory overrun
    }

    if (batches.length === 0) {
      batches.push([]);
      currentBatchTotalMessageSize = 0;
    }
    const batch = batches[batches.length - 1];

    batch.push({ timestamp, message });
    currentBatchTotalMessageSize += messageBytesSize;

    debugMessages(timestamp, message);
    debugStats('log message', messageBytesSize, 'bytes', 'batches:', batches.length, 'batchItems:', batch.length, 'batchBytes:', currentBatchTotalMessageSize);

    // need to start a new batch?
    const maxBatchNumItemsExceeded = batch.length >= maxBatchNumItems;
    const maxBatchNumBytesExceeded = currentBatchTotalMessageSize >= maxBatchNumBytes - maxMessageNumBytes;
    if (maxBatchNumItemsExceeded || maxBatchNumBytesExceeded) {
      batches.push([]);
      currentBatchTotalMessageSize = 0;
      debug('new batch', { maxBatchNumItemsExceeded, maxBatchNumBytesExceeded });
    }

    const promise = new Promise((resolve) => callbacks.add(resolve));

    callCallbacksIfEmptyQueue();

    return promise;
  }

  function close() {
    debug('close');
    stopped = true;
    clearTimeout(timeout);
  }

  processQueue();

  return { log, close };
}

class CloudWatchTransport extends Transport {
  constructor(options) {
    super(options);
    const {
      aws,
      logGroupName,
      logStreamName,
      shouldCreateLogGroup = false,
      shouldCreateLogStream = true,
      formatLog = ({ level, message }) => `${level}: ${message}`,
      minInterval = 2000,
      maxQueuedBatches = 1000,
      onError = console.error,
    } = options;

    // eslint-disable-next-line no-underscore-dangle
    this._onError = onError;

    const client = new CloudWatchLogsClient(aws);

    const onFatalError = (err) => {
      try {
        this.emit('error', err); // this will cause winston to close the transport
      } catch (ignored) { /* ignored */ } // for some reason this.emit('error') also throws the error

      onError(err);
    };

    // eslint-disable-next-line no-underscore-dangle
    this._transport = transport({ client, logGroupName, logStreamName, shouldCreateLogGroup, shouldCreateLogStream, formatLog, onError, onFatalError, minInterval, maxQueuedBatches });
  }

  close() {
    // eslint-disable-next-line no-underscore-dangle
    this._transport.close();
  }

  log(info, cb = () => {}) {
    // eslint-disable-next-line no-underscore-dangle
    this._transport.log(+new Date(), info).then(() => {
      this.emit('logged', info); // not sure about this but it's found in other transports
      cb();
    }).catch((err) => {
      // eslint-disable-next-line no-underscore-dangle
      this._onError(err);
      cb(); // doesn't seem like this supports an error
    });
  }
}

module.exports = CloudWatchTransport;