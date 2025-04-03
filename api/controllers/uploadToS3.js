import 'dotenv/config.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

export async function getS3SignedUrl(req, res) {
  const { fileName, fileType } = req.body;

  const command = new PutObjectCommand({
    Bucket: "reelzapp",
    Key: `userDP/${fileName}`,
    ContentType: fileType,
    // ACL: "public-read",
    // Body: await readFile(file)
  });
  try {
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    // console.log("got the signed url", signedUrl)
    res.json({
      uploadURL: signedUrl,
      fileURL: `https://reelzapp.s3.us-east-1.amazonaws.com/userDP/${fileName}`
    })
  } catch(err) {
    console.log("Error while generating a url", err);
    res.status(500).json({ error: err.message })
  }
}