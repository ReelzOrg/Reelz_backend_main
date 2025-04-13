import 'dotenv/config.js';
import jwt from 'jsonwebtoken';

//the req.user has the userId and username
export default function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const jwtToken = authHeader && authHeader.split(' ')[1];

  if (!jwtToken) {
    return res.status(401).json({ message: 'Unauthorized: No jwt token provided' });
  }

  jwt.verify(jwtToken, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Forbidden: Invalid jwt token' });
    }
    req.user = decoded; // Attach decoded payload (e.g., user ID) to request object
    next();
  });
}