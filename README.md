# `cloudwatch-winston`

Robust and simple [Winston](https://github.com/winstonjs/winston) transport for AWS CloudWatch Logs

## Features

- Tries very hard to deliver messages, even in case of errors
- Does not fail or break when losing internet connection
- Does not implement the complex and error-prone *sequence token* logic (no longer needed)
- Follows [AWS strict logging rules](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html)
- Truncates long messages (handling UTF-8 characters correctly)
- Customisable memory buffer size, prevents memory overrun by dropping logs when queue is full
- Logs to CloudWatch when messages have been truncated or dropped due to full queue
- Passes actual log timestamps to CloudWatch
- Cleans up resources when Winston closes the Transport
- Auto-creates log group and stream (optional)
- AWS SDK v3

## Usage

```js
import CloudWatchTransport from 'cloudwatch-winston';
import { format } from 'node:util';

const cloudWatchTransport = new CloudWatchTransport({
  logGroupName: 'my-log-group',
  logStreamName: new Date().toISOString().replace(/[-:]/g, '/'),
  shouldCreateLogGroup: false,
  shouldCreateLogStream: true,
  aws: {
    credentials: {
      accessKeyId: '',
      secretAccessKey: '',
    },
    region: 'us-east-1',
  },
  formatLog: (item) => `${item.level}: ${item.message}`,
});


// https://github.com/winstonjs/winston/issues/1427
const combineMessageAndSplat = () => ({
  transform(info) {
    const { [Symbol.for('splat')]: args = [], message } = info;
    info.message = format(message, ...args);
    return info;
  },
});

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    combineMessageAndSplat(),
    winston.format.simple(),
  ),
});

logger.add(cloudWatchTransport);

// When you call close on the logger, it will automatically close the transport and clean up
// logger.close()
```

## Options

```js
{
  aws: {
    credentials: { // required
      accessKeyId: '',
      secretAccessKey: '',
    },
    region: '',
  },
  logGroupName: '', // required
  logStreamName: '', // required

  // whether to auto create the log group
  shouldCreateLogGroup: false,

  // whether to auto create the log stream
  shouldCreateLogStream: true,

  // handle non-fatal errors
  onError: (err) => console.error(err),

  // customise how to format log messages
  formatLog: ({ level, message }) => `${level}: ${message}`,

  // a function that allows to you provide custom timestamp for log entries sent to CloudWatch. Must return number of milliseconds since epoch. Default: use `timestamp` metadata provided by `winston.format.timestamp()`
  getTimestamp: ({ timestamp }) => +new Date(),

  // minimum interval between batch requests sent to AWS (don't set too low!)
  minInterval: 2000,

  // max number of pending batches - once this limit is exceeded, log calls will be dropped. Note that each batch can have up to 10k messages and a total of about 1MB.
  maxQueuedBatches: 100,

  // Text to append to truncated message. Set to empty string to disable.
  truncatedMessageSuffix: ' TRUNCATED',

  // If maxQueuedBatches is exceeded, we will send queueOverrunMessage to CloudWatch Logs *once*, until queue has returned to normal again. Set to empty string to disable this behavior.
  queueOverrunMessage: 'Log queue overrun',

  // Whether to abandon any remaining queued batches when the transport closes, or retry them until delivered
  abandonQueueOnClose: true,
}
```

## Example

[test.mjs](./test.mjs)

```js
DEBUG=CloudWatchTransport,CloudWatchTransport:* node test.mjs
```

### TODO

- Max retries option?
- Types

## Alternatives

### [`winston-aws-cloudwatch`](https://github.com/timdp/winston-aws-cloudwatch)

- Seems to work ok, however simply stops working when there's a loss of internet connection
- Unmaintained
- AWS SDK v2
- Doesn't adhere to [AWS strict logging rules](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html)

### [`winston-cloudwatch`](https://github.com/lazywithclass/winston-cloudwatch)

- Most popular
- Haven't tested
- Many issues
- Many dependencies
- Code is a bit hard to follow

## Release

```
np
```
