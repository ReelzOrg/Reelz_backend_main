import { mediaProcessingSchema } from "./schemas.js"

export const ProducerNames = {
  MEDIA: {
    name: "mediaProducer",
    schema: mediaProcessingSchema,
    topic: 'media_processing'
  },
}