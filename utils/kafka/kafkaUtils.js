import { KafkaJS } from "@confluentinc/kafka-javascript";

const kafka = new KafkaJS.Kafka({
  brokers: ["localhost:9092"],
  clientId: "reelz-node-client"
});

export class KafkaProducerManager  {
  static producers = new Map(); // Tracking all producers

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
  static async send(name, sendParams, config = {}) {
    const producer = await KafkaProducerManager.getProducer(name, config);
    return producer.send(sendParams);
  }

  /**Disconnect all producers*/
  static async shutdownAll() {
    const shutdowns = [];
    for (const [name, producer] of KafkaProducerManager.producers.entries()) {
      shutdowns.push(producer.disconnect());
    }
    await Promise.all(shutdowns);
    KafkaProducerManager.producers.clear();
  }
}