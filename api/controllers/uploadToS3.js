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

export async function getS3SignedUrl(res, filePath, fileType) {
  const command = new PutObjectCommand({
    Bucket: "reelzapp",
    Key: filePath,
    ContentType: fileType,
    // ACL: "public-read",
    // Body: await readFile(file)
  });

  try {
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    // console.log("got the signed url", signedUrl)
    res.json({
      success: true,
      uploadURL: signedUrl,
      fileURL: `https://reelzapp.s3.us-east-1.amazonaws.com/${filePath}`
    })
  } catch(err) {
    console.log("Error while generating a url", err);
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function getMultipleSignedUrls(res, bucketName, fileKeys, fileTypes) {
  const urls = await Promise.all(
    fileKeys.map(async (key, index) => {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: fileTypes[index],
        // ACL: 'public-read',
      });

      try {
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
        return signedUrl;
      } catch (err) {
        console.log("Error while generating a url", err);
        return ""
        // return res.status(500).json({ success: false, error: err.message })
      }
    })
  );

  // console.log("These are the urls of multiple uplaod to s3:", urls);
  return { success: true, uploadURLs: urls, fileURLs: fileKeys.map((key) => `https://reelzapp.s3.us-east-1.amazonaws.com/${key}`)  };
  // return res.json({ success: true, uploadURLs: urls, fileURLs: fileKeys.map((key) => `https://reelzapp.s3.us-east-1.amazonaws.com/${key}`)  });

  // return urls;
}
