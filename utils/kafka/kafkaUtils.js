import { KafkaJS } from "@confluentinc/kafka-javascript";
import { SchemaRegistry, SchemaType } from "@kafkajs/confluent-schema-registry";
import { mediaProcessingSchema } from "./schemas";

// const kafka = new KafkaJS.Kafka({
//   brokers: ["localhost:9092"],
//   clientId: "reelz-node-client"
// });
const kafka = new KafkaJS.Kafka({ KafkaJS: { brokers: ["localhost:9092"], clientId: "reelz-node-client" } })

export class KafkaProducerManager  {
  static producers = new Map(); // Tracking all producers

  #privateMethod() {
    return "This is a private method"
  }

  /**
   * Get or create a named producer
   * @param {string} name
   * @param {object} config - optional producer config
   * @returns {KafkaJS.Producer}
   * Defining a getProducer allows for lazy initialization. Only creates a producer if required
   */
  static async getProducer(name, config = {}) {
    if (!KafkaProducerManager.producers.has(name)) {
      const producer = kafka.producer(config);
      await producer.connect();
      KafkaProducerManager.producers.set(name, producer);
    }
    return KafkaProducerManager.producers.get(name);
  }

  /**
   * Send a message using a named producer
   * @param {string} name
   * @param {object} sendParams - { topic, messages }
   * @param {object} config - optional producer config
   */
  static async send(producerObj, data, config = {}) {
    const producer = await KafkaProducerManager.getProducer(producerObj.name, config);
    const schemaId = await registerSchema(producerObj.schema);

    // This returns a raw byte buffer hence don't have to use JSON.stringify() on the messages
    const encodedMsg = await registry.encode(schemaId, data);

    await producer.send({
      topic: producerObj.topic,
      messages: [{ value: encodedMsg }]
    });
  }

  /**Disconnect all producers*/
  static async shutdownAll() {
    const shutdowns = [];
    for (const [name, producer] of KafkaProducerManager.producers.entries()) {
      shutdowns.push(producer.disconnect());
    }
    await Promise.all(shutdowns);
    KafkaProducerManager.producers.clear();
    console.log('Kafka producers disconnected.');
  }
}

const registry = new SchemaRegistry({
  // clientId: "reelz-node-client"
  host: 'http://localhost:9092',
});

/**
 * 
 * @param {object} schema AVRO schema object
 * @returns The id of the registered schema
 */
async function registerSchema(schema) {
  const { id } = await registry.register({
    type: SchemaType.AVRO,
    schema: JSON.stringify(schema)
  });

  return id;
}