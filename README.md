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
  
  // Create one instance for the application
  const metrics = new StackMetrics('caglabs-155116', 'testapp', 'dev', 'testapp', 5000)
  
  // Create one instance for each metric/variable 
  const myValueMetric = metrics.createMetric('myValue', 'My test value', StackMetrics.TYPE_INT64)
  const myRateMetric = metrics.createMetric('myRate', 'My test value, a rate/min', StackMetrics.TYPE_RATE_PER_MINUTE)

  let myValue = 0

  // Write metrics/values once a second
  setInterval(() => {
      console.log('Usage: write myValue:', myValue)
      myValueMetric.write(myValue)
      myRateMetric.write(myValue)
      myValue++
    },
    1000)
```
