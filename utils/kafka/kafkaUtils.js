import { KafkaJS, CompressionTypes } from "@confluentinc/kafka-javascript";
import { SchemaRegistry, SchemaType } from "@kafkajs/confluent-schema-registry";

// --- Kafka and Schema Registry Configuration ---
// Use environment variables for production readiness.
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map(b => b.trim());
const SCHEMA_REGISTRY_HOST = process.env.SCHEMA_REGISTRY_HOST || 'http://localhost:8081';

const kafka = new KafkaJS.Kafka({
  brokers: KAFKA_BROKERS,
  clientId: "reelz-node-client"
});

const registry = new SchemaRegistry({ host: SCHEMA_REGISTRY_HOST });
const schemaCache = new Map(); // Cache for registered schema IDs

// --- Kafka Producer Manager ---
export class KafkaProducerManager {
  static producers = new Map(); // Pool of named producers

  /**
   * Lazily gets or creates a named producer with production-ready settings.
   * @param {string} name - The logical name for the producer (e.g., 'user-events-producer').
   * @param {object} [config={}] - Optional KafkaJS producer config overrides.
   * @returns {Promise<KafkaJS.Producer>}
   */
  static async getProducer(name, config = {}) {
    if (!KafkaProducerManager.producers.has(name)) {
      console.log(`[KafkaProducerManager] Creating new producer: ${name}`);
      // Production-ready defaults: enable idempotency and require all replicas to acknowledge.
      const producerConfig = {
        idempotent: true,
        'acks': 'all',
        ...config,
      };
      const producer = kafka.producer(producerConfig);
      await producer.connect();
      KafkaProducerManager.producers.set(name, producer);
    }
    return KafkaProducerManager.producers.get(name);
  }

  /**
   * Sends a batch of messages to a Kafka topic with compression and DLQ support. (without AVRO encoding)
   * @param {string} topic - Target topic name
   * @param {Array<Object>} messages - Array of message objects with value and optional key/headers
   * @param {string} [deadLetterTopic] - Optional DLQ topic name for failed messages
   * @returns {Promise<boolean>} True if all messages sent successfully, false if any sent to DLQ
   */
  static async sendBatch(topic, messages, deadLetterTopic = null) {
    const producer = await this.getProducer();
    
    // Encode all messages
    const encodedMessages = messages.map(msg => ({
      value: typeof msg.value === 'string' ? msg.value : JSON.stringify(msg.value),
      key: msg.key || null,
      headers: msg.headers || {},
      partition: msg.partition || null,
    }));

    const payload = {
      topic,
      messages: encodedMessages,
      compression: CompressionTypes.Snappy, // Efficient compression for batches
    };

    return this._sendWithRetries(producer, payload, 3, 200, deadLetterTopic);
  }

  /**
   * Sends a batch of Avro-encoded messages with retry logic and compression.
   * This is the preferred method for high throughput.
   * @param {{name: string, topic: string, schema: object}} producerObj - Producer and topic info.
   * @param {Array<{key?: string|Buffer, value: object, headers?: Object, partition?: number}>} messages - An array of messages to send.
   * @param {string} [deadLetterTopic] - Optional DLQ topic name for failed messages
   * @returns {Promise<boolean>} True if all messages sent successfully, false if any sent to DLQ
   */
  static async sendBatchAvro(producerObj, messages, deadLetterTopic = null) {
    const { name, topic, schema } = producerObj;
    const producer = await KafkaProducerManager.getProducer(name);
    const schemaId = await getSchemaId(topic, schema);

    // Encode all message values in the batch
    const encodedMessages = await Promise.all(
      messages.map(async (msg) => ({
        key: msg.key,
        value: await registry.encode(schemaId, msg.value),
        headers: msg.headers || {},
        partition: msg.partition || null,
      }))
    );

    const payload = {
      topic,
      messages: encodedMessages,
      compression: CompressionTypes.Snappy, // Efficient compression for batches
    };

    return this._sendWithRetries(producer, payload, 3, 200, deadLetterTopic);
  }

  /**
   * Internal send method with exponential backoff retry logic and DLQ support.
   * @private
   * @param {import('kafkajs').Producer} producer - Kafka producer instance
   * @param {Object} payload - Message payload to send
   * @param {number} [maxRetries=3] - Maximum number of retry attempts
   * @param {number} [initialBackoffMs=200] - Initial backoff time in milliseconds
   * @param {string} [deadLetterTopic] - Optional DLQ topic name
   * @returns {Promise<boolean>} True if sent successfully, false if sent to DLQ
   */
  static async _sendWithRetries(producer, payload, maxRetries = 3, initialBackoffMs = 200, deadLetterTopic) {
    let attempt = 0;
    let lastError = null;
    
    while (attempt < maxRetries) {
      try {
        await producer.send(payload);
        return true; // Successfully sent
      } catch (error) {
        lastError = error;
        console.error(`[KafkaProducerManager] Send failed on attempt ${attempt + 1}/${maxRetries}`, { 
          error: error.message, 
          topic: payload.topic,
          stack: error.stack
        });
        
        attempt++;
        if (attempt >= maxRetries) {
          console.error(`[KafkaProducerManager] All ${maxRetries} attempts failed.`);
          break; // Exit loop to handle DLQ logic
        }
        
        // Exponential backoff with jitter
        const jitter = Math.random() * 100; // 0-100ms jitter
        const delay = Math.min(initialBackoffMs * Math.pow(2, attempt - 1) + jitter, 30000); // Cap at 30s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we get here, all retries failed
    if (deadLetterTopic) {
      try {
        const dlqMessage = {
          ...payload,
          topic: deadLetterTopic,
          messages: payload.messages.map(msg => ({
            ...msg,
            headers: {
              ...msg.headers,
              'x-original-topic': payload.topic,
              'x-failure-reason': lastError?.message || 'Unknown error',
              'x-attempts': attempt.toString(),
              'x-timestamp': new Date().toISOString(),
              'x-error-type': lastError?.name || 'Error'
            }
          }))
        };
        
        console.warn(`[KafkaProducerManager] Sending failed message to DLQ: ${deadLetterTopic}`, {
          originalTopic: payload.topic,
          messageCount: payload.messages?.length || 0,
          error: lastError?.message
        });
        
        // Try once to send to DLQ without retries to avoid infinite loops
        try {
          await producer.send(dlqMessage);
          return false; // Message sent to DLQ
        } catch (dlqError) {
          console.error(`[KafkaProducerManager] Failed to send to DLQ ${deadLetterTopic}`, {
            error: dlqError.message,
            originalError: lastError?.message
          });
          // Re-throw the original error, not the DLQ error
          throw lastError;
        }
      } catch (dlqError) {
        console.error('[KafkaProducerManager] Error preparing DLQ message', dlqError);
        throw lastError; // Re-throw original error if DLQ processing fails
      }
    }
    
    // If no DLQ configured, throw the last error
    throw lastError;
  }

  /**
   * Disconnects all managed producers gracefully.
   */
  static async shutdownAll() {
    console.log('[KafkaProducerManager] Shutting down all producers...');
    const shutdowns = Array.from(KafkaProducerManager.producers.values()).map(p => p.disconnect());
    await Promise.all(shutdowns);
    KafkaProducerManager.producers.clear();
    console.log("[KafkaProducerManager] All producers disconnected.");
  }
}

/**
 * Gets a schema ID from the cache or registers it if not found.
 * @param {string} topic - The topic name, used to create the schema subject.
 * @param {object} schema - The Avro schema object.
 * @returns {Promise<number>} The schema ID.
 */
async function getSchemaId(topic, schema) {
  const subject = `${topic}-value`; // Standard subject naming convention
  if (schemaCache.has(subject)) {
    return schemaCache.get(subject);
  }

  console.log(`[SchemaRegistry] Caching new schema for subject: ${subject}`);
  const { id } = await registry.register({
    type: SchemaType.AVRO,
    schema: JSON.stringify(schema),
  });

  schemaCache.set(subject, id);
  return id;
}