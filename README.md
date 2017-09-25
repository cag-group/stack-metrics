## Javascript library for Google Cloud Monitoring

Javascript module for writing custom metrics in Google StackDriver Monitoring API.
https://cloud.google.com/monitoring/docs/

### Usage example

```
  StackMetrics = require('stack-metrics')
  ...
  const metrics = new StackMetrics('service-account-key.json', 'eqt-integration-k8s', 'testapp', 5000)
  const myValueMetric = metrics.createMetric('myValue', 'My test value', StackMetrics.TYPE_INT64)
  const myRateMetric = metrics.createMetric('myRate', 'My test value, a rate/min', StackMetrics.TYPE_RATE)

  setInterval(() => {
      myValueMetric.writeCount(1)
      myRateMetric.writeRate(1)
    },
    1000)
```
The service account file is needed when running locally, outside Google Cloud.