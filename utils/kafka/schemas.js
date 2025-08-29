/**
 * const addDataToQueue = JSON.stringify({toProcessUrls, uploadType, post_id, timeStamp: Date.now()});
 * messages: [{
        value: addDataToQueue,
        headers: { 'x-trace-id': uuidv4() },
      }]
 */

export const mediaProcessingSchema = {
  type: "record",
  name: "MediaProcessingJob",
  namespace: "xyz.virajdoshi.reelz",
  fields: [
    {
      name: "toProcessUrls",
      type: {
        type: "array",
        items: "string"
      },
      doc: "An array of s3 urls of media files to be processed"
    },
    {
      name: "uploadType",
      type: "string",
      doc: "The type of upload (image, video, story)"
    },
    {
      name: "post_id",
      type: "string",
      doc: "The id of the post to which the media belongs (uuid)"
    },
    {
      name: "timeStamp",
      type: "long",
      doc: "The timestamp of the request"
    },
    {
      name: "traceId",
      type: "string",
      doc: "The trace id of the request"
    }
  ]
}