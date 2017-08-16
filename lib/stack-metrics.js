const Monitoring = require('@google-cloud/monitoring')

/**
 * Represents a custom metric variable in the application. Call to update the value.
 */
class StackMetric {
  constructor (stackMetrics, metricName) {
    this._stackMetrics = stackMetrics
    this._metricName = metricName
  }

  write (value) {
    this._stackMetrics.writeMetric(this._metricName, value)
  }
}

/**
 * Interface to Custom Metrics in Stackdriver Monitoring.
 */
class StackMetrics {
  /**
   * @param projectId The project id
   * @param appName Application name (k8s namespace)
   * @param envName Environment name (dev, stage, production)
   * @param metricGroupName Grouping name of metrics handled by this StackMetrics instance. Could be either appName or
   * a name representing generic metrics for an app (version, health etc)
   * @param sendInterval Interval to send values to Stackdriver Monitoring API, milliseconds, default is 5000
   */
  constructor (projectId, appName, envName, metricGroupName, sendInterval) {
    this.projectId = projectId
    this.appName = appName
    this.envName = envName
    this.metricGroupName = metricGroupName
    this.client = Monitoring.v3().metricServiceClient()
    setInterval(() => { this._sendValues() }, sendInterval || 5000)
    this.metricsMap = new Map()
  }

  /**
   * Create a custom metric reqeust object, used in the Stackdriver Monitoring API
   * @param metricName Metric name, displayed
   * @param metricDescription Metric description. A one liner.
   * @param metricType StackMetrics.TYPE_...
   * @returns {StackMetric} Request object
   */
  createMetric (metricName, metricDescription, metricType) {
    const descriptor = {
      description: metricDescription,
      displayName: metricName,
      type: 'custom.googleapis.com/' + this.metricGroupName + '/' + metricName,
      metricKind: 'GAUGE',
      valueType: StackMetrics._getValueTypeForMetricType(metricType),
      // unit: '{USD}',
      labels: [
        {
          key: 'appName',
          valueType: 'STRING',
          description: 'Application name'
        },
        {
          key: 'envName',
          valueType: 'STRING',
          description: 'Environment (prod, stage, ...)'
        }
      ]
    }

    this.metricsMap.set(metricName, {
      name: metricName,
      valueType: StackMetrics._getValueTypeForMetricType(metricType),
      requestDescriptor: descriptor,
      responseDescriptor: undefined,
      rateInterval: StackMetrics._getRateIntervalForMetricType(metricType),
      prevTimestamp: Date.now(),
      prevRateValue: 0,
      samples: []
    })
    console.log('Created metric', metricName)
    return new StackMetric(this, metricName)
  }

  /**
   * Write a custom metric value
   * @param metricName Name of metric
   * @param value Metric value
   */
  writeMetric (metricName, value) {
    console.log('writeMetric', metricName, value)
    const metric = this.metricsMap.get(metricName)
    const now = Date.now()
    if (metric.rateInterval) {
      // Metric is a Rate-type
      const rate = (value - metric.prevRateValue) / (now - metric.prevTimestamp) * metric.rateInterval
      metric.prevRateValue = value
      metric.samples.push({startTime: metric.prevTimestamp, endTime: Date.now(), value: rate})
    } else {
      // Metric is a value type
      metric.samples.push({startTime: metric.prevTimestamp, endTime: Date.now(), value: value})
    }
    metric.prevTimestamp = now
  }

  async _sendValues () {
    console.log('_sendValues')
    // Send any pending createMetricDescriptors requests
    let responses
    try {
      responses = await Promise.all(
        Array.from(this.metricsMap.values())
          .filter(e => !e.responseDescriptor) // remove metrics we've already created
          .map(metric => {
            console.log('Sending createMetricDescriptor', metric.name)
            return this.client.createMetricDescriptor(this._createMetricsRequest(metric.requestDescriptor))
          }))
    } catch (err) {
      console.log('createMetricDescriptor failed', err)
    }

    // Set responseDescriptor for each reply from createMetricDescriptor
    responses.forEach(response => {
      const descriptor = response[0]
      console.log('Sent createMetricDescriptor', descriptor.displayName)
      this.metricsMap.get(descriptor.displayName).responseDescriptor = descriptor
    })

    // Send pending metric values
    this._sendTimeSeries()
  }

  _createMetricsRequest (descriptor) {
    return {
      name: this.client.projectPath(this.projectId),
      metricDescriptor: descriptor
    }
  }

  async _sendTimeSeries () {
    const timeSeriesData = Array.from(this.metricsMap.values()).map(metric => this._createTimeSeriesData(metric))

    const request = {
      name: this.client.projectPath(this.projectId),
      timeSeries: timeSeriesData
    }

    if (timeSeriesData.length > 0) {
      // Write time series data
      try {
        console.log('Sending time series data, number of timeSeries:', request.timeSeries.length)
        const results = await this.client.createTimeSeries(request)
        Array.from(this.metricsMap.values()).map(metric => {
          metric.samples = []

          // Clear the values we've sent
          console.log('Sent time series data for metricName', metric.name)
        })
        return results
      } catch (err) {
        console.log('Error sending timeSeries:', err)
      }
    } else {
      console.log('_sendTimeSeries: Nothing to send')
    }
  }

  _createTimeSeriesData (metric) {
    let points
    if (metric.samples.length > 0) {
      if (metric.rateInterval) {
        // Metric is a Rate-type
        const average = StackMetrics._calcAverageValue(metric.samples)
        const startTime = metric.samples[0].startTime
        const endTime = metric.samples[metric.samples.length - 1].endTime
        points = [StackMetrics._createDataPoint(metric.valueType, {
          startTime: startTime,
          endTime: endTime,
          value: average
        })]
        console.log('rate', metric.name, average)
      } else {
        // Metric is a value-type
        points = [StackMetrics._createDataPoint(metric.valueType, metric.samples[metric.samples.length - 1])]
        // points = metric.samples.map(sample => StackMetrics._createDataPoint(sample))
      }
    } else {
      points = []
    }
    return {
      metric: {
        type: metric.requestDescriptor.type,
        labels: {
          appName: 'ftpd-gcs',
          envName: 'dev'
        }
      },
      resource: {
        type: 'global',
        labels: {
          project_id: this.projectId
        }
      },
      points: points
    }
  }

  static _calcAverageValue (samples) {
    return samples.map(e => e.value).reduce((a, b) => a + b) / samples.length
  }

  static _createDataPoint (valueType, sample) {
    switch (valueType) {
      case StackMetrics.VALUE_TYPE_INT64:
        return {
          interval: {
            endTime: {
              seconds: sample.endTime / 1000
            }
          },
          value: {
            int64Value: sample.value
          }
        }
      case StackMetrics.VALUE_TYPE_DOUBLE:
        return {
          interval: {
            endTime: {
              seconds: sample.endTime / 1000
            }
          },
          value: {
            doubleValue: sample.value
          }
        }
      case StackMetrics.VALUE_TYPE_BOOL:
        return {
          interval: {
            endTime: {
              seconds: sample.endTime / 1000
            }
          },
          value: {
            boolValue: sample.value
          }
        }
    }
  }

  static _getValueTypeForMetricType (metricType) {
    switch (metricType) {
      case StackMetrics.TYPE_INT64:
        return StackMetrics.VALUE_TYPE_INT64
      case StackMetrics.TYPE_BOOL:
        return StackMetrics.VALUE_TYPE_BOOL
      case StackMetrics.TYPE_DOUBLE:
        return StackMetrics.VALUE_TYPE_DOUBLE
      case StackMetrics.TYPE_RATE_PER_SECOND:
        return StackMetrics.VALUE_TYPE_DOUBLE
      case StackMetrics.TYPE_RATE_PER_MINUTE:
        return StackMetrics.VALUE_TYPE_DOUBLE
      case StackMetrics.TYPE_RATE_PER_HOUR:
        return StackMetrics.VALUE_TYPE_DOUBLE
      case StackMetrics.TYPE_RATE_PER_DAY:
        return StackMetrics.VALUE_TYPE_DOUBLE
      default:
        throw new Error('Unknown metricType', metricType)
    }
  }

  static _getRateIntervalForMetricType (metricType) {
    switch (metricType) {
      case StackMetrics.TYPE_RATE_PER_SECOND:
        return 1000
      case StackMetrics.TYPE_RATE_PER_MINUTE:
        return 1000 * 60
      case StackMetrics.TYPE_RATE_PER_HOUR:
        return 1000 * 3600
      case StackMetrics.TYPE_RATE_PER_DAY:
        return 1000 * 3600 * 24
      default:
        return undefined
    }
  }
}

StackMetrics.VALUE_TYPE_INT64 = 'INT64'
StackMetrics.VALUE_TYPE_BOOL = 'BOOL'
StackMetrics.VALUE_TYPE_DOUBLE = 'DOUBLE'

StackMetrics.TYPE_INT64 = 'INT64'
StackMetrics.TYPE_BOOL = 'BOOL'
StackMetrics.TYPE_DOUBLE = 'DOUBLE'
StackMetrics.TYPE_RATE_PER_SECOND = 'RATE_PER_SECOND'
StackMetrics.TYPE_RATE_PER_MINUTE = 'RATE_PER_MINUTE'
StackMetrics.TYPE_RATE_PER_HOUR = 'RATE_PER_HOUR'
StackMetrics.TYPE_RATE_PER_DAY = 'RATE_PER_DAY'

module.exports = StackMetrics
