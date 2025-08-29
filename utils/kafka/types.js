import { mediaProcessingSchema } from "./schemas"

export const ProducerNames = {
  MEDIA: {
    schema: mediaProcessingSchema,
    topic: 'media_processing'
  },
}