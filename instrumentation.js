import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { logs, NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

// For troubleshooting, set the log level to DiagLogLevel.DEBUG
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'reelz-server',
  [ATTR_SERVICE_VERSION]: '1.0.0',
});

const sdk = new NodeSDK({
  resource,
  // traceExporter: new ConsoleSpanExporter(),
  logRecordProcessor: new logs.BatchLogRecordProcessor(
    new ConsoleLogRecordExporter(),
    new OTLPLogExporter()
  ),
  // metricReader: new PeriodicExportingMetricReader({
  //   exporter: new ConsoleMetricExporter(),
  // }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
