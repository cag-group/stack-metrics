const StackMetrics = require('../lib/stack-metrics')

const test = async () => {
  const metrics = new StackMetrics(undefined, 'google-project-id', 'testapp', 'dev', 'testapp', 5000)
  const myValueMetric = metrics.createMetric('myValue', 'My test value', StackMetrics.TYPE_INT64)
  const myRateMetric = metrics.createMetric('myRate', 'My test value, a rate/min', StackMetrics.TYPE_RATE_PER_MINUTE)

  setInterval(() => {
      myValueMetric.writeCount(1)
      myRateMetric.writeRate(1)
      myValue++
    },
    1000)
}
test()
