const StackMetrics = require('../lib/stack-metrics.js')
const sinon = require('sinon')
const should = require('should')

const START_TIMESTAMP = 10000
const SEND_INTERVAL = 2000

describe('StackMetrics', async () => {
  this.createMetricDescriptorStub = (client) => {
    return sinon.stub(client, 'createMetricDescriptor').callsFake(request => {
      return [request.metricDescriptor]
    })
  }

  let metrics, stubs

  beforeEach(() => {
    stubs = []

    metrics = new StackMetrics(undefined, 'testproject', 'testapp', 0)

    const projectPathStub = sinon.stub(metrics.client, 'projectPath')
    stubs.push(projectPathStub)
    projectPathStub.callsFake(projectId => {
      // console.log('Called mock projectPath')
      return '/fdn/' + projectId
    })
  })

  afterEach(() => {
    for (let s of stubs) {
      s.restore()
    }
  })

  it('createMetricDescriptor', async () => {
    const stub = sinon.stub(metrics.client, 'createMetricDescriptor')
    stubs.push(stub)
    stub.callsFake(request => {
      // console.log('Called mock createMetricDescriptor, request:', JSON.stringify(request))
      request.name.should.be.exactly('/fdn/testproject')
      request.metricDescriptor.description.should.be.exactly('Test value')
      request.metricDescriptor.displayName.should.be.exactly('testapp.testValue1')
      request.metricDescriptor.type.should.be.exactly('custom.googleapis.com/testapp/testValue1')
      request.metricDescriptor.metricKind.should.be.exactly('GAUGE')
      request.metricDescriptor.valueType.should.be.exactly('INT64')
      request.metricDescriptor.labels[0].key.should.be.exactly('appName')
      request.metricDescriptor.labels[0].valueType.should.be.exactly('STRING')
      request.metricDescriptor.labels[1].key.should.be.exactly('envName')
      request.metricDescriptor.labels[1].valueType.should.be.exactly('STRING')
      request.metricDescriptor.labels[2].key.should.be.exactly('instanceName')
      request.metricDescriptor.labels[2].valueType.should.be.exactly('STRING')
      return [request.metricDescriptor]
    })

    const createTimeSeriesStub = sinon.stub(metrics.client, 'createTimeSeries')
    stubs.push(createTimeSeriesStub)
    createTimeSeriesStub.callsFake(request => {
      // console.log('Called mock createTimeSeries')
      request.timeSeries.length.should.be.exactly(1)
      const timeSeries = request.timeSeries[0]
      timeSeries.metric.type.should.be.exactly('custom.googleapis.com/testapp/testValue1')
      timeSeries.metric.labels.appName.should.be.exactly('testapp')
      timeSeries.metric.labels.envName.should.be.exactly('dev')
      timeSeries.metric.labels.instanceName.should.be.exactly('dev')
      timeSeries.resource.labels.project_id.should.be.exactly('testproject')
    })

    const metric = metrics.createMetric('testValue1', 'Test value', StackMetrics.TYPE_INT64)
    metric.write(1)
    await metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL)

    stub.called.should.be.exactly(true)
    createTimeSeriesStub.called.should.be.exactly(true)
  })

  it('createTimeSeries, value type', async () => {
    const createMetricDescriptorStub = this.createMetricDescriptorStub(metrics.client)
    stubs.push(createMetricDescriptorStub)

    const createTimeSeriesStub = sinon.stub(metrics.client, 'createTimeSeries')
    stubs.push(createTimeSeriesStub)
    createTimeSeriesStub.callsFake(request => {
      // console.log('Called mock createTimeSeries')
      request.timeSeries.length.should.be.exactly(1)
      const timeSeries = request.timeSeries[0]
      timeSeries.points.length.should.be.exactly(1)
      timeSeries.points[0].interval.endTime.seconds.should.be.exactly((START_TIMESTAMP + SEND_INTERVAL) / 1000)
      timeSeries.points[0].value.int64Value.should.be.exactly(6)
    })

    const testValueMetric = metrics.createMetric('testValue1', 'Test value', StackMetrics.TYPE_INT64)
    testValueMetric.writeCount(1)
    testValueMetric.writeCount(2)
    testValueMetric.writeCount(3)

    return metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL)
  })

  it('createTimeSeries, value types, many samples', async () => {
    const createMetricDescriptorStub = this.createMetricDescriptorStub(metrics.client)
    stubs.push(createMetricDescriptorStub)

    let test

    const createTimeSeriesStub = sinon.stub(metrics.client, 'createTimeSeries')
    stubs.push(createTimeSeriesStub)
    createTimeSeriesStub.callsFake(request => {
      console.log('Called mock createTimeSeries, request:', JSON.stringify(request))
      if (test === 1) {
        request.timeSeries.length.should.be.exactly(2)

        const timeSeries1 = request.timeSeries[0]
        timeSeries1.metric.type.should.be.exactly('custom.googleapis.com/testapp/testValue1')
        timeSeries1.points.length.should.be.exactly(1)
        timeSeries1.points[0].interval.endTime.seconds.should.be.exactly((START_TIMESTAMP + SEND_INTERVAL) / 1000)
        timeSeries1.points[0].value.int64Value.should.be.exactly(6)

        const timeSeries2 = request.timeSeries[1]
        timeSeries2.metric.type.should.be.exactly('custom.googleapis.com/testapp/testValue2')
        timeSeries2.points.length.should.be.exactly(1)
        timeSeries2.points[0].interval.endTime.seconds.should.be.exactly((START_TIMESTAMP + SEND_INTERVAL) / 1000)
        timeSeries2.points[0].value.int64Value.should.be.exactly(12)
      } else if (test === 2) {
        throw new Error('createTimeSeries should not be called when no metric value has changed')
      } else if (test === 3) {
        request.timeSeries.length.should.be.exactly(1)

        const timeSeries1 = request.timeSeries[0]
        timeSeries1.metric.type.should.be.exactly('custom.googleapis.com/testapp/testValue1')
        timeSeries1.points.length.should.be.exactly(1)
        timeSeries1.points[0].interval.endTime.seconds.should.be.exactly((START_TIMESTAMP + SEND_INTERVAL * 3) / 1000)
        timeSeries1.points[0].value.int64Value.should.be.exactly(12)
      }
    })

    const testValue1Metric = metrics.createMetric('testValue1', 'Test value 1', StackMetrics.TYPE_INT64)
    const testValue2Metric = metrics.createMetric('testValue2', 'Test value 2', StackMetrics.TYPE_INT64)

    test = 1
    testValue1Metric.writeCount(6)
    testValue2Metric.writeCount(12)
    await metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL)

    test = 2
    await metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL * 2)

    test = 3
    testValue1Metric.writeCount(6)
    return metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL * 3)
  })

  it('createTimeSeries, rate types', async () => {
    const createMetricDescriptorStub = this.createMetricDescriptorStub(metrics.client)
    stubs.push(createMetricDescriptorStub)

    let test

    const createTimeSeriesStub = sinon.stub(metrics.client, 'createTimeSeries')
    stubs.push(createTimeSeriesStub)
    createTimeSeriesStub.callsFake(request => {
      // console.log('Called mock createTimeSeries, request:', JSON.stringify(request))
      request.timeSeries.length.should.be.exactly(1)
      const timeSeries1 = request.timeSeries[0]
      timeSeries1.points.length.should.be.exactly(1)

      if (test === 1) {
        timeSeries1.metric.type.should.be.exactly('custom.googleapis.com/testapp/testRate')

        timeSeries1.points[0].value.doubleValue.should.be.exactly(6)
        timeSeries1.points[0].interval.endTime.seconds.should.be.exactly(12)
      } else if (test === 2) {
        timeSeries1.points[0].value.doubleValue.should.be.exactly(0) // No writes since last send
      } else if (test === 3) {
        timeSeries1.points[0].value.doubleValue.should.be.exactly(10)
      }
    })

    const testRateMetric = metrics.createMetric('testRate', 'Test value, a rate', StackMetrics.TYPE_RATE)

    test = 1
    testRateMetric.writeRate(1)
    testRateMetric.writeRate(2)
    testRateMetric.writeRate(3)

    await metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL)

    test = 2
    await metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL * 2)

    test = 3
    testRateMetric.writeRate(10)
    return metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL * 3)
  })

  it('createTimeSeries, rate type never written', async () => {
    const createMetricDescriptorStub = this.createMetricDescriptorStub(metrics.client)
    stubs.push(createMetricDescriptorStub)

    let test

    const createTimeSeriesStub = sinon.stub(metrics.client, 'createTimeSeries')
    stubs.push(createTimeSeriesStub)
    createTimeSeriesStub.callsFake(async request => {
      // console.log('Called mock createTimeSeries, request:', JSON.stringify(request))
      // Only the rate metric should be sent, not the value metric
      request.timeSeries.length.should.be.exactly(1)
      const timeSeries1 = request.timeSeries[0]
      timeSeries1.points.length.should.be.exactly(1)
      timeSeries1.metric.type.should.be.exactly('custom.googleapis.com/testapp/testRate1')
      timeSeries1.points[0].value.doubleValue.should.be.exactly(0)
      if (test === 1) {
        timeSeries1.points[0].interval.endTime.seconds.should.be.exactly(12)
      } else if (test === 2) {
        timeSeries1.points[0].interval.endTime.seconds.should.be.exactly(14)
      }
    })

    metrics.createMetric('testValue1', 'Test value', StackMetrics.TYPE_INT64)
    metrics.createMetric('testRate1', 'Test rate value', StackMetrics.TYPE_RATE)

    test = 1
    await metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL)

    test = 2
    return metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL * 2)
  })
})
