import fs from 'fs';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream'; // Node.js built-in stream utility
import multer from "multer";

import { s3 } from "../api/controllers/uploadToS3.js";

export default async function handleFileUpload(req, res, filePath) {
	//FOR FILES MORE THAN 100MB (recommened by AWS) use S3 multipart upload
	//stream the image/video files from client to server (this function will take care of the incoming chunks of data)
	//do some light-weight processing on those chunks if needed and then upload individual chunks to s3
	//each chunk is recommended to be "at least" 5MB
	
	//FOR FILES LESS THAN 100MB
	//check the network on the frontend, if the network is weak then lower the 100MB threshold ()
	//directly upload the file to s3

	const uploadedFiles = [];

	try {
    for (const [index, file] of req.files.entries()) {
      const fileStream = fs.createReadStream(file.path);
      // const readableStream = new Readable();
      // readableStream.push(file.buffer);
      // readableStream.push(null);

      // Determine the S3 key for the current file.
      // The 'filePath' argument can be a single string or an array of strings (for multiple files).
      const currentS3Key = Array.isArray(filePath) ? filePath[index] : filePath;

      const command = new PutObjectCommand({
				Bucket: "reelzapp",
				Key: currentS3Key, // Use the S3 key specific to this file
				Body: fileStream,
				ContentLength: file.size, // Explicitly set ContentLength
				ContentType: file.mimetype, // Corrected property name to mimetype
				// ACL: "public-read",
			});
      await s3.send(command);

      uploadedFiles.push({s3Key: currentS3Key, s3Location: `https://reelzapp.s3.amazonaws.com/${currentS3Key}`});
      fs.unlinkSync(file.path);
    }
    // console.log('Multiple files uploaded to S3:', uploadedFiles);
    return {
			success: true,
      message: `${uploadedFiles.length} files uploaded to S3 successfully!`,
      uploadedFiles: uploadedFiles
    };
  } catch (error) {
    console.error('Error uploading multiple files to S3:', error);
    return {success: false, message: 'Error uploading files to S3.', error: error.message};
  }
}

// --- Error handling middleware for Multer ---
export function multerErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'One or more files are too large. Max 50MB per file allowed.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files uploaded.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: `Unexpected field: ${err.field}. Check your field name.` });
    }
    return res.status(400).json({ message: err.message });
  } else if (err) {
    // Other errors (e.g., from fileFilter)
    return res.status(500).json({ message: err.message });
  }
  next(); // Pass to next middleware if no Multer error
}