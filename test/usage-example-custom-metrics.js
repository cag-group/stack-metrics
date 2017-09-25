const StackMetrics = require('../lib/stack-metrics')

const test = async () => {
  const metrics = new StackMetrics('../secrets/service-account-key/service-account-key.json', 'eqt-integration-k8s', 'testapp', 5000)
  const myValueMetric = metrics.createMetric('myValue', 'My test value', StackMetrics.TYPE_INT64)
  const myRateMetric = metrics.createMetric('myRate', 'My test rate value', StackMetrics.TYPE_RATE)

  setInterval(() => {
      myValueMetric.writeCount(1)
      myRateMetric.writeRate(1)
    },
    1000)
}
test()
