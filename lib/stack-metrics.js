const monitoring = require('@google-cloud/monitoring')
const fs = require('fs')
const logger = require('logger')('metric_logger')

/**
 * Represents a custom metric variable in the application. Call to update the value.
 */
class StackMetric {
  constructor (stackMetrics, metricName) {
    this._stackMetrics = stackMetrics
    this._metricName = metricName
    this._count = 0
  }

  writeCount (delta) {
    this._count += delta
    this._stackMetrics.writeMetric(this._metricName, this._count)
  }

  writeRate (delta) {
    this._stackMetrics.writeMetric(this._metricName, delta)
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
   * @param keyFilename Filename for service account key, set to undefined if not used
   * @param projectId The project id
   * @param appName Application name (k8s namespace)
   * @param sendInterval Interval to send values to Stackdriver Monitoring API, milliseconds. If set to 0,
   * no automatic sending are performed and sending is done by explicitly calling sendValues(timestamp)
   * If undefined, the default value of 5000 is set.
   */
  constructor (keyFilename, projectId, appName, sendInterval) {
    this.projectId = projectId
    this.appName = appName
    this.envName = process.env.NODE_ENV || 'dev'
    this.instanceName = process.env.HOSTNAME || 'dev'
    this.metricsMap = new Map()

    if (!keyFilename) {
      this.init(sendInterval, undefined)
    } else {
      fs.stat(keyFilename, (err, stats) => {
        this.init(sendInterval, !err && stats.isFile() ? keyFilename : undefined)
      })
    }
  }

  init (sendInterval, keyFilename) {
    this.metricsMap = new Map()
    this.client = monitoring.metric({keyFilename: keyFilename})
    if (sendInterval === undefined) {
      sendInterval = 5000
    }
    if (sendInterval !== 0) {
      setInterval(async () => {
        try {
          await this.sendValues(Date.now())
        } catch (err) {
          logger.warn('sendValues failed:', err.stack || err)
        }
      }, sendInterval)
    }
  }

  /**
   * Create a custom metric request object, used in the Stackdriver Monitoring API
   * @param metricName Metric name, displayed
   * @param metricDescription Metric description. A one liner.
   * @param metricType StackMetrics.TYPE_...
   * @returns {StackMetric} Request object
   */
  createMetric (metricName, metricDescription, metricType) {
    let displayName = this.appName + '.' + metricName // Add appName as prefix
    const descriptor = {
      description: metricDescription,
      displayName: displayName,
      type: 'custom.googleapis.com/' + this.appName + '/' + metricName,
      metricKind: 'GAUGE',
      valueType: StackMetrics._getValueTypeForMetricType(metricType),
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
        },
        {
          key: 'instanceName',
          valueType: 'STRING',
          description: 'Pod\'s instance name'
        }
      ]
    }

    this.metricsMap.set(metricName, {
      name: metricName,
      type: metricType,
      valueType: StackMetrics._getValueTypeForMetricType(metricType),
      requestDescriptor: descriptor,
      responseDescriptor: undefined,
      value: metricType === StackMetrics.TYPE_RATE ? 0 : undefined
    })
    logger.info({message: 'Created metric ' + metricName, metricType: metricType})
    return new StackMetric(this, metricName)
  }

  /**
   * Write a custom metric value
   * @param metricName Name of metric
   * @param value Metric value
   */
  writeMetric (metricName, value) {
    StackMetrics.debug('writeMetric', metricName, value)
    const metric = this.metricsMap.get(metricName)
    if (metric) {
      if (metric.type === StackMetrics.TYPE_RATE) {
        // Metric is a Rate-type
        metric.value += value
      } else {
        // Metric is a value type
        metric.value = value
      }
    }
  }

  async sendValues (timestamp) {
    StackMetrics.debug('_sendValues')

    // Send pending metric creation
    await this._sendCreateMetrics()

    // Send pending metric values
    return this._sendTimeSeries(timestamp)
  }

  static _getMetricName (type) {
    // Example type: 'custom.googleapis.com/testapp/testValue1', shall return 'testValue1'
    return type.split('/').pop()
  }

  async _sendCreateMetrics () {
    // Send any pending createMetricDescriptors requests
    let responses = await Promise.all(
      Array.from(this.metricsMap.values())
        .filter(e => !e.responseDescriptor) // remove metrics we've already created
        .map(metric => {
          StackMetrics.debug('Sending createMetricDescriptor', metric.name)
          return this.client.createMetricDescriptor(this._createMetricsRequest(metric.requestDescriptor))
        }))
      .catch(err => { throw err })

    // Set responseDescriptor for each reply from createMetricDescriptor
    responses.forEach(response => {
      const descriptor = response[0]
      StackMetrics.debug('Sent createMetricDescriptor, descriptor:', JSON.stringify(descriptor))
      this.metricsMap.get(StackMetrics._getMetricName(descriptor.type)).responseDescriptor = descriptor
    })
  }

  _createMetricsRequest (descriptor) {
    return {
      name: this.client.projectPath(this.projectId),
      metricDescriptor: descriptor
    }
  }

  async _sendTimeSeries (timestamp) {
    const timeSeriesData = Array.from(this.metricsMap.values())
      .filter(metric => metric.type === StackMetrics.TYPE_RATE || metric.value !== undefined)
      .map(metric => this._createTimeSeriesData(metric, timestamp))

    const request = {
      name: this.client.projectPath(this.projectId),
      timeSeries: timeSeriesData
    }

    if (timeSeriesData.length > 0) {
      // Write time series data
      StackMetrics.debug('Sending time series data, number of timeSeries:', request.timeSeries.length)
      try {
        const results = await this.client.createTimeSeries(request)
        Array.from(this.metricsMap.values()).map(metric => {
          // Clear the rate values we've sent
          if (metric.type === StackMetrics.TYPE_RATE) {
            metric.value = 0
          } else {
            metric.value = undefined
          }
          StackMetrics.debug('Sent time series data for metricName', metric.name)
        })
        return results
      } catch (e) {
        logger.debug('createTimeSeries failed, request:', request, ', metricsMap:', this.metricsMap)
        throw e
      }
    } else {
      StackMetrics.debug('_sendTimeSeries: Nothing to send')
    }
  }

  _createTimeSeriesData (metric, timestamp) {
    return {
      metric: {
        type: metric.requestDescriptor.type,
        labels: {
          appName: this.appName,
          envName: this.envName,
          instanceName: this.instanceName,
        }
      },
      resource: {
        type: 'global',
        labels: {
          project_id: this.projectId
        }
      },
      points: [StackMetrics._createDataPoint(metric.valueType, timestamp, metric.value)]
    }
  }

  static _createDataPoint (valueType, timestamp, value) {
    switch (valueType) {
      case StackMetrics.VALUE_TYPE_INT64:
        return {
          interval: {
            endTime: {
              seconds: timestamp / 1000
            }
          },
          value: {
            int64Value: value
          }
        }
      case StackMetrics.VALUE_TYPE_DOUBLE:
        return {
          interval: {
            endTime: {
              seconds: timestamp / 1000
            }
          },
          value: {
            doubleValue: value
          }
        }
      case StackMetrics.VALUE_TYPE_BOOL:
        return {
          interval: {
            endTime: {
              seconds: timestamp / 1000
            }
          },
          value: {
            boolValue: value
          }
        }
      default:
        throw new Error('Unexpected valueType:', valueType)
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
      case StackMetrics.TYPE_RATE:
        return StackMetrics.VALUE_TYPE_DOUBLE
      default:
        throw new Error('Unknown metricType', metricType)
    }
  }

  static debug () {
    if (StackMetric.debug) {
      arguments['0'] = 'STACK-METRICS '.concat(arguments['0'])
      return logger.debug.apply(logger, arguments)
    }
  }
}

StackMetric.debug = process.env.NODE_DEBUG && /\bstack-metrics\b/.test(process.env.NODE_DEBUG)

StackMetrics.VALUE_TYPE_INT64 = 'INT64'
StackMetrics.VALUE_TYPE_BOOL = 'BOOL'
StackMetrics.VALUE_TYPE_DOUBLE = 'DOUBLE'

StackMetrics.TYPE_INT64 = 'INT64'
StackMetrics.TYPE_BOOL = 'BOOL'
StackMetrics.TYPE_DOUBLE = 'DOUBLE'
StackMetrics.TYPE_RATE = 'RATE'

module.exports = StackMetrics
