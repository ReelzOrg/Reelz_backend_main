import { mediaProcessingSchema } from "./schemas"

export const ProducerNames = {
  MEDIA: {
    name: "mediaProducer",
    schema: mediaProcessingSchema,
    topic: 'media_processing'
  },
}