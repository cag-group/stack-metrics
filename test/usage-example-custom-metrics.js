const StackMetrics = require('../lib/stack-metrics')

const test = async () => {
  const metrics = new StackMetrics('caglabs-155116', 'testapp', 'dev', 'testapp', 5000)
  const myValueMetric = metrics.createMetric('myValue', 'My test value', StackMetrics.TYPE_INT64)
  const myRateMetric = metrics.createMetric('myRate', 'My test value, a rate/min', StackMetrics.TYPE_RATE_PER_MINUTE)

  let myValue = 0

  setInterval(() => {
      console.log('Usage: write myValue:', myValue)
      myValueMetric.write(myValue)
      myRateMetric.write(myValue)
      myValue++
    },
    1000)
}
test()
