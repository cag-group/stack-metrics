## Javascript library for Google Cloud Monitoring

Javascript module for writing custom metrics in Google StackDriver Monitoring API.
https://cloud.google.com/monitoring/docs/

### Usage example

package.json:

```
    "stack-metrics": "git+https://github.com/cag-group/stack-metrics.git",
```


```
  StackMetrics = require('stack-metrics')
  ...
  const metrics = new StackMetrics('../service-account.json', 'google-project-id', 'testapp', 'dev', 'testapp', 5000)
  const myValueMetric = metrics.createMetric('myValue', 'My test value', StackMetrics.TYPE_INT64)
  const myRateMetric = metrics.createMetric('myRate', 'My test value, a rate/min', StackMetrics.TYPE_RATE_PER_MINUTE)

  setInterval(() => {
      myValueMetric.writeCount(1)
      myRateMetric.writeRate(1)
    },
    1000)
```
