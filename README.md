## Javascript library for Google Cloud Monitoring

Javascript module for writing custom metrics in Google StackDriver Monitoring API.
https://cloud.google.com/monitoring/docs/

### Usage example

```
StackMetrics = require('stack-metrics')
...
async function getAnotherValue (metric) {
  console.log('getAnotherValue called for metric', metric.name)
  return 42
}
...
const metrics = new StackMetrics('my-project', 'testapp', interval, '../secrets/service-account-key/service-account-key.json')
const myValueMetric = metrics.createMetric('myValue', 'My test value', StackMetrics.TYPE_INT64)
metrics.createMetric('anotherValueMetric', 'Another test value', StackMetrics.TYPE_INT64, getAnotherValue)
const myRateMetric = metrics.createMetric('myRate', 'My test rate value', StackMetrics.TYPE_RATE)

setInterval(() => {
  myValueMetric.writeCount(1)
  myRateMetric.writeRate(1)
},
1000)
```

The service account file is needed when running locally, outside Google Cloud.