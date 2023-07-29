# `cloudwatch-winston`

Robust and simple [Winston](https://github.com/winstonjs/winston) transport for AWS CloudWatch Logs

## Features

- Tries very hard to deliver messages, even in case of errors
- Does not fail or break when losing internet connection
- Follows [AWS strict logging rules](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html)
- Customisable memory buffer size
- Does not implement the complex and error-prone *sequence token* logic (not longer needed)
- Cleans up resources when Winston closes the Transport
- AWS SDK v3
- Auto-creates log group and stream (optional)

## Usage

```js
import CloudWatchTransport from 'cloudwatch-winston';

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
    info.message = util.format(message, ...args);
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

// When you call close on the logger, it will automatically close the Transport
// logger.close()
```

## Options

```js
{
  aws: {
    credentials: {
      accessKeyId: '',
      secretAccessKey: '',
    },
    region: '',
  },
  logGroupName: '',
  logStreamName: '',

  // whether to auto create the log group
  shouldCreateLogGroup = false,

  // whether to auto create the log stream
  shouldCreateLogStream = true,

  // handle non-fatal errors
  onError: (err) => console.error(err),

  // customise how to format log messages
  formatLog = ({ level, message, meta }) => '',

  // minimum interval between batch requests sent to AWS (don't set too low)
  minInterval = 2000,

  // max number of pending batches - once this limit is exceeded, log calls will be ignored. Note that each batch can have up to 10k messages and a total of about 1MB.
  maxQueuedBatches = 1000,
}
```

## Example

[test.mjs](./test.mjs)

```js
DEBUG=CloudWatchTransport,CloudWatchTransport:* node test.mjs
```

### TODO

- Max retries option?
- Allow processing whole queue before stopping (but what if stuck in an error loop)
- Types

## Alternatives

### [`winston-aws-cloudwatch`](https://github.com/timdp/winston-aws-cloudwatch)

- Seems to work ok, however simply stops working when there's a loss of internet connection
- Unmaintained
- AWS SDK v2
- Doesn't adhere to [AWS strict logging rules](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html)

### [`winston-cloudwatch`](https://github.com/lazywithclass/winston-cloudwatch)

- Haven't tested
- Many issues
- Many dependencies
- Code is a bit hard to follow

## Release

```
np
```