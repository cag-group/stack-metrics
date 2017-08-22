const StackMetrics = require('../lib/stack-metrics.js')
const should = require('should')
const sinon = require('sinon')

const START_TIMESTAMP = 10000
const SEND_INTERVAL = 2000

describe('StackMetrics', () => {
  this.createMetricDescriptorStub = (client) => {
    return sinon.stub(client, 'createMetricDescriptor').callsFake(request => {
      return Promise.resolve([request.metricDescriptor])
    })
  }

  beforeEach(() => {
    this.stubs = []

    this.metrics = new StackMetrics(undefined, 'testproject', 'testapp', 'testenv', 'testapp', 0)
    this.metrics.setStartTimestamp(START_TIMESTAMP)

    const projectPathStub = sinon.stub(this.metrics.client, 'projectPath')
    this.stubs.push(projectPathStub)
    projectPathStub.callsFake(projectId => {
      console.log('Called mock projectPath')
      return '/fdn/' + projectId
    })

  })

  afterEach(() => {
    for (let s of this.stubs) {
      s.restore()
    }
  })

  it('createMetricDescriptor', done => {
    const stub = sinon.stub(this.metrics.client, 'createMetricDescriptor')
    this.stubs.push(stub)
    stub.callsFake(request => {
      console.log('Called mock createMetricDescriptor, request:', JSON.stringify(request))
      request.name.should.be.exactly('/fdn/testproject')
      request.metricDescriptor.description.should.be.exactly('Test value')
      request.metricDescriptor.displayName.should.be.exactly('testValue1')
      request.metricDescriptor.type.should.be.exactly('custom.googleapis.com/testapp/testValue1')
      request.metricDescriptor.metricKind.should.be.exactly('GAUGE')
      request.metricDescriptor.valueType.should.be.exactly('INT64')
      request.metricDescriptor.labels[0].key.should.be.exactly('appName')
      request.metricDescriptor.labels[0].valueType.should.be.exactly('STRING')
      request.metricDescriptor.labels[1].key.should.be.exactly('envName')
      request.metricDescriptor.labels[1].valueType.should.be.exactly('STRING')
      return Promise.resolve([request.metricDescriptor])
    })

    const createTimeSeriesStub = sinon.stub(this.metrics.client, 'createTimeSeries')
    this.stubs.push(createTimeSeriesStub)
    createTimeSeriesStub.callsFake(request => {
      console.log('Called mock createTimeSeries')
      for (let timeSeries of request.timeSeries) {
        timeSeries.metric.type.should.be.exactly('custom.googleapis.com/testapp/testValue1')
        timeSeries.metric.labels.appName.should.be.exactly('testapp')
        timeSeries.metric.labels.envName.should.be.exactly('testenv')
        timeSeries.resource.labels.project_id.should.be.exactly('testproject')
      }
    })

    this.metrics.createMetric('testValue1', 'Test value', StackMetrics.TYPE_INT64)
    this.metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL)
      .then(() => done())
      .catch(e => done(e))
  })

  it('createTimeSeries, value type', done => {
    const createMetricDescriptorStub = this.createMetricDescriptorStub(this.metrics.client)
    this.stubs.push(createMetricDescriptorStub)

    const createTimeSeriesStub = sinon.stub(this.metrics.client, 'createTimeSeries')
    this.stubs.push(createTimeSeriesStub)
    createTimeSeriesStub.callsFake(request => {
      console.log('Called mock createTimeSeries')
      for (let timeSeries of request.timeSeries) {
        timeSeries.points.length.should.be.exactly(1)
        timeSeries.points[0].interval.endTime.seconds.should.be.exactly((START_TIMESTAMP + SEND_INTERVAL) / 1000)
        timeSeries.points[0].value.int64Value.should.be.exactly(6)
      }
    })

    const testValueMetric = this.metrics.createMetric('testValue1', 'Test value', StackMetrics.TYPE_INT64)
    testValueMetric.writeCount(1)
    testValueMetric.writeCount(2)
    testValueMetric.writeCount(3)

    this.metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL)
      .then(() => done())
      .catch(e => done(e))
  })

  it('createTimeSeries, rate type', done => {
    const createMetricDescriptorStub = this.createMetricDescriptorStub(this.metrics.client)
    this.stubs.push(createMetricDescriptorStub)

    let test

    const createTimeSeriesStub = sinon.stub(this.metrics.client, 'createTimeSeries')
    this.stubs.push(createTimeSeriesStub)
    createTimeSeriesStub.callsFake(request => {
      console.log('Called mock createTimeSeries, request:', request)
      for (let timeSeries of request.timeSeries) {
        timeSeries.points.length.should.be.exactly(1)
        if (test === 1) {
          timeSeries.points[0].value.doubleValue.should.be.exactly(3) // (1+2+3) / 2 seconds
        } else if (test === 2) {
          timeSeries.points[0].value.doubleValue.should.be.exactly(0) // No writes since last send
        } else if (test === 3) {
          timeSeries.points[0].value.doubleValue.should.be.exactly(5) // (10) / 2 seconds
        }
      }
      return Promise.resolve({})
    })

    const testRateMetric = this.metrics.createMetric('testRate1', 'Test value, a rate/sec', StackMetrics.TYPE_RATE_PER_SECOND)

    test = 1
    testRateMetric.writeRate(1)
    testRateMetric.writeRate(2)
    testRateMetric.writeRate(3)
    this.metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL)
      .then(() => {
        test = 2
        // testRateMetric.writeRate(10)
        return this.metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL * 2)
      })
      .then(() => {
        test = 3
        testRateMetric.writeRate(10)
        return this.metrics.sendValues(START_TIMESTAMP + SEND_INTERVAL * 3)
      })
      .then(() => done())
      .catch(e => done(e))
  })
})
